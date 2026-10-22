/**
 * Estado do jogo e acoes do jogador.
 *
 * Game guarda o estado completo de uma run (jogador, setor, turno, log).
 * Nao conhece o DOM: a camada web chama os mesmos metodos que o terminal
 * chamava via handle_key().
 */

import * as ai from "./ai.js";
import { sfx } from "./audio.js";
import * as dungeon from "./dungeon.js";
import * as sonar from "./sonar.js";
import * as status from "./status.js";
import {
  DOOR_CLOSED,
  DOOR_LOCKED,
  DOOR_OPEN,
  MAX_DEPTH,
  NOISE,
  NOISE_DECAY,
  NOISE_MAX,
  PERSONAL_RADIUS,
  SONAR_COOLDOWN,
} from "./data.js";
import { Item, Monster, Player } from "./entities.js";
import { C } from "./theme.js";
import { Rng } from "./rng.js";

export const DIRS8 = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

export const DIR_BY_KEY = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

const MAX_BEAM = 30;

export class Game {
  constructor(seed) {
    this.seed = Number(seed) >>> 0;
    this.rng = new Rng(this.seed);
    this.player = new Player();
    // Kit de campo: uma faca e o RULER. Sem isso o operador comeca
    // desarmado e a primeira sala mata.
    this.player.equipped.weapon = new Item("dagger");
    this.player.inventory.push(new Item("ruler"));
    this.level = null;
    this.depth = 1;
    this.turn = 0;
    this.messages = [];
    this.over = false;
    this.victory = false;
    this.cause = "";
    this.last_hit_by = "";
    this.noise_source = null;
    this.beam = [];
    this.beam_turn = -1;
    this.reset_used = false;
    this.mode = "play"; // play | measure
    this._level_counter = 0;
    this.msg("ECOS SYSTEM ONLINE.");
    this.enter_level(1, true);
  }

  // ------------------------------------------------------------- mensagens
  msg(text, color = C.WHITE) {
    this.messages.push([text, color]);
    if (this.messages.length > 80) this.messages.shift();
  }

  recent(count = 3) {
    return this.messages.slice(-count);
  }

  // ---------------------------------------------------------------- setor
  _generate_level(depth) {
    this._level_counter += 1;
    const lvl_rng = this.rng.fork(`lvl${this._level_counter}:${depth}`);
    return dungeon.generate(lvl_rng, depth);
  }

  enter_level(depth, first = false) {
    this.depth = depth;
    this.player.depth = depth;
    this.level = this._generate_level(depth);
    [this.player.x, this.player.y] = this.level.stairs_up;
    this.reset_used = false;
    this.beam = [];
    sonar.reveal_circle(
      this.level,
      this.player.x,
      this.player.y,
      PERSONAL_RADIUS,
      this.turn
    );
    if (this.player.diagnostic) {
      sonar.reveal_all(this.level, this.turn);
      this.msg("DIAGNOSTIC ROM REVEALS THE SECTOR LAYOUT.", C.LCYAN);
    }
    if (!first) this.msg(`YOU DESCEND TO SECTOR ${depth}.`, C.LGREEN);
  }

  descend() {
    if (this.depth >= MAX_DEPTH) {
      this.victory = true;
      this.over = true;
      this.cause = "THE DEVOURER IS SILENT. ECOS IS YOURS.";
      return;
    }
    this.enter_level(this.depth + 1);
  }

  // --------------------------------------------------------------- ruido
  add_noise(amount, source) {
    if (amount <= 0) return;
    const player = this.player;
    player.noise = Math.min(NOISE_MAX, player.noise + amount);
    player.peak_noise = Math.max(player.peak_noise, player.noise);
    if (source) this.noise_source = [source[0], source[1]];
  }

  // ---------------------------------------------------------------- turno
  end_turn() {
    if (this.over) return;
    this.turn += 1;
    const player = this.player;
    player.turns += 1;
    if (player.sonar_cooldown > 0) player.sonar_cooldown -= 1;

    for (const [line, color] of ai.run_monsters(this)) {
      this.msg(line, color);
    }

    player.noise = Math.max(0, player.noise - NOISE_DECAY);
    player.peak_noise = Math.max(player.peak_noise, player.noise);

    sonar.fade(this.level, this.turn, player.memory_persists);
    sonar.reveal_circle(this.level, player.x, player.y, PERSONAL_RADIUS, this.turn);

    if (player.hp <= 0) {
      player.hp = 0;
      this.over = true;
      if (!this.cause) this.cause = `TAKEN BY THE ${this.last_hit_by || "DARK"}`;
    }
  }

  // ------------------------------------------------------------- comandos
  /** Processa uma tecla. Retorna 'ok' | 'help' | 'inventory' | 'drop' | 'title'. */
  handle_key(kind, ch = "") {
    if (this.mode === "measure") {
      if (kind === "escape") {
        this.mode = "play";
        return "ok";
      }
      const delta = DIR_BY_KEY[kind];
      if (delta) this.measure(delta[0], delta[1]);
      return "ok";
    }

    if (DIR_BY_KEY[kind]) {
      this.move(...DIR_BY_KEY[kind]);
      return "ok";
    }

    if (kind !== "char" || !ch) return "ok";

    // O movimento e so pelas setas, entao nenhuma letra disputa tecla
    // com ele: cada comando aceita MAIUSCULA e minuscula.
    const lower = ch.toLowerCase();
    if (lower === "s" || lower === "p") this.ping();
    else if (lower === "m") this.begin_measure();
    else if (lower === "l") this.lock_door();
    else if (lower === "u") this.unlock_door();
    else if (lower === "g") this.pickup();
    else if (lower === "d") return "drop";
    else if (lower === "i") return "inventory";
    else if (lower === "x") this.reset_sector();
    else if (lower === "b") this.brute_force();
    else if (lower === "q") return "title";
    else if (ch === "?") return "help";
    else if (ch === ".") this.wait();
    return "ok";
  }

  // ------------------------------------------------------------- movimento
  move(dx, dy) {
    const player = this.player;
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (!this.level.in_bounds(nx, ny)) return;

    const monster = this.level.monster_at(nx, ny);
    if (monster !== null) {
      this.player_attack(monster);
      this.end_turn();
      return;
    }

    const tile = this.level.tiles[ny][nx];
    if (tile.blocks()) {
      if (tile.is_door()) {
        if (tile.door === DOOR_CLOSED) {
          tile.door = DOOR_OPEN;
          this.add_noise(NOISE.lock, [nx, ny]);
          this.msg("YOU OPEN THE DOOR.");
          this.end_turn();
        } else if (
          this.level.password &&
          player.passwords.includes(this.level.password)
        ) {
          tile.door = DOOR_OPEN;
          this.add_noise(NOISE.lock, [nx, ny]);
          this.msg(`SLATE ACCEPTED: ${this.level.password}.`, C.LGREEN);
          this.end_turn();
        } else {
          this.msg("THE DOOR IS LOCKED. [B] FORCES IT.", C.LRED);
        }
      }
      return;
    }

    player.x = nx;
    player.y = ny;
    this.add_noise(status.step_noise(player, this.level), [nx, ny]);
    if (nx === this.level.stairs_down[0] && ny === this.level.stairs_down[1]) {
      this.descend();
    }
    this.end_turn();
  }

  wait() {
    this.msg("YOU WAIT.");
    this.end_turn();
  }

  player_attack(monster) {
    const { damage, crit } = status.damage_to_monster(
      this.player,
      monster,
      this.rng
    );
    monster.hp -= damage;
    this.add_noise(NOISE.combat, [this.player.x, this.player.y]);
    if (crit) {
      this.msg(`CRITICAL! ${monster.name} TAKES ${damage}.`, C.YELLOW);
    } else {
      this.msg(`YOU HIT ${monster.name} FOR ${damage}.`);
    }
    sfx.hit();
    if (monster.hp <= 0) {
      monster.alive = false;
      this.player.kills += 1;
      this.msg(`${monster.name} IS DESTROYED.`, C.LGREEN);
    }
  }

  // ---------------------------------------------------------------- sonar
  ping() {
    const player = this.player;
    if (player.sonar_cooldown > 0) {
      this.msg(`SONAR RECHARGING (${player.sonar_cooldown} TURNS).`, C.LRED);
      return false;
    }
    const radius = status.sonar_radius(player);
    sonar.reveal_circle(this.level, player.x, player.y, radius, this.turn);
    const amount = status.ping_noise(player);
    this.add_noise(amount, [player.x, player.y]);
    player.sonar_cooldown = SONAR_COOLDOWN;
    this.msg(`SONAR PING. RADIUS ${radius}. NOISE +${amount}.`, C.LCYAN);
    sfx.ping();
    return true;
  }

  // ---------------------------------------------------------------- ruler
  begin_measure() {
    if (!this.player.has_ruler) {
      this.msg("YOU CARRY NO RULER.", C.LRED);
      return false;
    }
    this.mode = "measure";
    return true;
  }

  measure(dx, dy) {
    const player = this.player;
    const { distance, cells } = sonar.reveal_ray(
      this.level,
      player.x,
      player.y,
      dx,
      dy,
      MAX_BEAM,
      this.turn
    );
    this.beam = cells;
    this.beam_turn = this.turn;
    this.add_noise(NOISE.ruler, [player.x, player.y]);
    this.msg(`RULER READS ${distance} TILES.`, C.LCYAN);
    sfx.blip();
    this.mode = "play";
    this.end_turn();
  }

  // ---------------------------------------------------------------- portas
  adjacent_doors() {
    const player = this.player;
    const doors = [];
    for (const [dx, dy] of DIRS8) {
      const x = player.x + dx;
      const y = player.y + dy;
      const tile = this.level.tile(x, y);
      if (tile && tile.is_door()) doors.push({ tile, x, y });
    }
    return doors;
  }

  /** Porta vizinha, filtrando pelo estado (want/avoid). */
  _adjacent_door(want = null, avoid = null) {
    for (const { tile } of this.adjacent_doors()) {
      if (want !== null && tile.door !== want) continue;
      if (avoid !== null && tile.door === avoid) continue;
      return tile;
    }
    return null;
  }

  lock_door() {
    if (this._adjacent_door() === null) {
      this.msg("NO DOOR BESIDE YOU.");
      return false;
    }
    const tile = this._adjacent_door(null, DOOR_LOCKED);
    if (tile === null) {
      this.msg("EVERY DOOR BESIDE YOU IS ALREADY LOCKED.");
      return false;
    }
    tile.door = DOOR_LOCKED;
    this.add_noise(NOISE.lock, [this.player.x, this.player.y]);
    this.msg("YOU LOCK THE DOOR.");
    sfx.door();
    this.end_turn();
    return true;
  }

  unlock_door() {
    const tile = this._adjacent_door(DOOR_LOCKED);
    if (tile === null) {
      this.msg("NO LOCKED DOOR BESIDE YOU.");
      return false;
    }
    tile.door = DOOR_OPEN;
    if (this.player.kernel) {
      this.msg("KERNEL UNLOCKS IT SILENTLY.", C.LGREEN);
    } else {
      this.add_noise(NOISE.unlock, [this.player.x, this.player.y]);
      this.msg("YOU UNLOCK THE DOOR.");
      sfx.door();
    }
    this.end_turn();
    return true;
  }

  brute_force() {
    const tile = this._adjacent_door(DOOR_LOCKED);
    if (tile === null) {
      this.msg("NO LOCKED DOOR BESIDE YOU.");
      return false;
    }
    tile.brute += 1;
    this.add_noise(NOISE.brute, [this.player.x, this.player.y]);
    if (tile.brute >= 3) {
      this.add_noise(NOISE.purge, [this.player.x, this.player.y]);
      this.msg("SYSTEM PURGE! THE DOOR EXPLODES.", C.LRED);
      tile.door = DOOR_OPEN;
      tile.brute = 0;
      this._spawn_purge_monsters();
    } else {
      this.msg(`THE DOOR HOLDS. ATTEMPT ${tile.brute} OF 3.`, C.LRED);
    }
    sfx.error();
    this.end_turn();
    return true;
  }

  _spawn_purge_monsters() {
    for (let i = 0; i < 2; i += 1) {
      const kind = this.rng.choice(["rat", "bat", "goblin"]);
      const monster = new Monster(kind, this.depth, this.rng);
      const spots = DIRS8.map(([dx, dy]) => [
        this.player.x + dx,
        this.player.y + dy,
      ]).filter(
        ([x, y]) => this.level.in_bounds(x, y) && this.level.is_passable(x, y)
      );
      if (spots.length === 0) continue;
      [monster.x, monster.y] = this.rng.choice(spots);
      this.level.monsters.push(monster);
    }
  }

  // ------------------------------------------------------------------ itens
  pickup() {
    const player = this.player;
    const rom = this.level.rom_at(player.x, player.y);
    if (rom !== null) {
      this.read_rom(rom);
      return;
    }

    const item = this.level.item_at(player.x, player.y);
    if (item === null) {
      this.msg("NOTHING TO TAKE HERE.");
      return;
    }
    if (player.load + item.kg > player.capacity) {
      this.msg("TOO HEAVY. LOSE SOMETHING FIRST.", C.LRED);
      return;
    }

    this.level.items.splice(this.level.items.indexOf(item), 1);
    if (item.category === "weapon") {
      const current = player.equipped.weapon;
      if (current === null || (item.data.atk || 0) > (current.data.atk || 0)) {
        if (current !== null) player.inventory.push(current);
        player.equipped.weapon = item;
        this.msg(`YOU EQUIP THE ${item.name}.`, C.LGREEN);
      } else {
        player.inventory.push(item);
        this.msg(`YOU TAKE THE ${item.name}.`);
      }
    } else if (item.category === "armor") {
      const current = player.equipped.armor;
      if (current === null || (item.data.dfn || 0) > (current.data.dfn || 0)) {
        if (current !== null) player.inventory.push(current);
        player.equipped.armor = item;
        this.msg(`YOU EQUIP THE ${item.name}.`, C.LGREEN);
      } else {
        player.inventory.push(item);
        this.msg(`YOU TAKE THE ${item.name}.`);
      }
    } else {
      player.inventory.push(item);
      this.msg(`YOU TAKE THE ${item.name}.`);
    }
    sfx.pickup();
    this.end_turn();
  }

  /** Equipa uma arma/armadura que ja esta na mochila (troca com a atual). */
  equip(item) {
    const slot =
      item.category === "weapon"
        ? "weapon"
        : item.category === "armor"
          ? "armor"
          : null;
    if (slot === null) return false;
    const index = this.player.inventory.indexOf(item);
    if (index < 0) return false;
    this.player.inventory.splice(index, 1);
    const current = this.player.equipped[slot];
    this.player.equipped[slot] = item;
    if (current) this.player.inventory.push(current);
    this.msg(`YOU EQUIP THE ${item.name}.`, C.LGREEN);
    return true;
  }

  drop_item(item) {
    const player = this.player;
    const index = player.inventory.indexOf(item);
    if (index >= 0) player.inventory.splice(index, 1);
    item.x = player.x;
    item.y = player.y;
    this.level.items.push(item);
    this.msg(`YOU DROP THE ${item.name}.`);
    this.end_turn();
  }

  use_item(item) {
    const player = this.player;
    const data = item.data;
    if (item.category !== "consumable") {
      // RULER, armas e armaduras nao se usam: nao podem ser gastas.
      this.msg(`THE ${item.name} CANNOT BE USED.`);
      return false;
    }
    if (data.heal) {
      player.hp = Math.min(player.max_hp, player.hp + data.heal);
      this.msg(`THE ${item.name} HEALS ${data.heal} HP.`, C.LGREEN);
    }
    if (data.noise) {
      const amount = data.noise;
      player.noise = Math.max(0, player.noise + amount);
      this.msg(`THE ${item.name} SHIFTS NOISE BY ${amount}.`);
    }
    if (data.stun) {
      const radius = data.stun;
      let count = 0;
      for (const monster of this.level.monsters) {
        if (
          monster.alive &&
          monster.distance_to(player.x, player.y) <= radius
        ) {
          monster.stun = 3;
          count += 1;
        }
      }
      this.add_noise(data.noise || 0, [player.x, player.y]);
      this.msg(`THE ${item.name} STUNS ${count} THING(S).`, C.LCYAN);
    }
    const index = player.inventory.indexOf(item);
    if (index >= 0) player.inventory.splice(index, 1);
    this.end_turn();
    return true;
  }

  // ------------------------------------------------------------------- ROM
  read_rom(rom) {
    if (this.player.free_rom_slots <= 0) {
      this.msg("NO FREE ROM SLOT. CHOOSE ONE TO OVERWRITE.", C.LRED);
      return false;
    }
    this.install_rom(rom);
    return true;
  }

  install_rom(rom) {
    const index = this.level.roms_on_floor.indexOf(rom);
    if (index >= 0) this.level.roms_on_floor.splice(index, 1);
    this.player.roms.push(rom);
    status.apply_rom(this.player, rom);
    this.msg(`ROM ${rom.name} READ. ${rom.desc}.`, C.YELLOW);
    sfx.rom();
    this.end_turn();
  }

  overwrite_rom(old_rom, new_rom) {
    const index = this.player.roms.indexOf(old_rom);
    if (index >= 0) this.player.roms.splice(index, 1);
    this.install_rom(new_rom);
  }

  // ------------------------------------------------------------------ reset
  reset_sector() {
    if (this.reset_used) {
      this.msg("RESET ALREADY USED IN THIS SECTOR.", C.LRED);
      return false;
    }
    this.reset_used = true;
    this.player.alert += 1;
    this.player.resets += 1;
    this.level = this._generate_level(this.depth);
    [this.player.x, this.player.y] = this.level.stairs_up;
    this.beam = [];
    this.msg(
      `RESET. SECTOR REGENERATED. ALERT IS NOW ${this.player.alert}.`,
      C.LRED
    );
    sfx.error();
    this.end_turn();
    return true;
  }
}
