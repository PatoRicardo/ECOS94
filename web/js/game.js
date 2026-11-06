/**
 * Estado do jogo e acoes do jogador.
 *
 * O mesmo motor roda solo e em party (2-5). Em party as acoes sao aplicadas
 * pelo host e o tick so fecha quando todos os vivos agiram (ou por timeout).
 * A descoberta e individual: cada Player tem sua propria memoria.
 */

import * as ai from "./ai.js";
import { sfx } from "./audio.js";
import * as dungeon from "./dungeon.js";
import * as sonar from "./sonar.js";
import * as status from "./status.js";
import {
  BASE_CAPACITY,
  DOOR_CLOSED,
  DOOR_LOCKED,
  DOOR_OPEN,
  MAX_DEPTH,
  MAX_PLAYERS,
  NOISE,
  NOISE_DECAY,
  NOISE_MAX,
  PERSONAL_RADIUS,
  RESPAWN_HP_RATIO,
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
  constructor(seed, options = {}) {
    this.seed = Number(seed) >>> 0;
    this.rng = new Rng(this.seed);
    const roster = Array.isArray(options.players) && options.players.length
      ? options.players.slice(0, MAX_PLAYERS)
      : [{ name: options.name || "OPERATOR" }];
    this.players = roster.map(
      (entry, index) => new Player(index, entry.name || `OPERATOR ${index + 1}`)
    );
    this.local_id = Math.max(
      0,
      Math.min(this.players.length - 1, Number(options.localId) || 0)
    );
    this.partyMode = this.players.length > 1 || Boolean(options.partyMode);
    this.alert = 0;
    for (const player of this.players) {
      player.equipped.weapon = new Item("dagger");
      player.inventory.push(new Item("ruler"));
    }
    this.level = null;
    this.depth = 1;
    this.turn = 0;
    this.messages = [];
    this.over = false;
    this.victory = false;
    this.cause = "";
    this.last_hit_by = "";
    this.noise_sources = new Map();
    this.beam = [];
    this.beam_turn = -1;
    this.reset_used = false;
    this.mode = "play"; // play | measure
    this._level_counter = 0;
    this.msg("ECOS SYSTEM ONLINE.");
    this.enter_level(1, true);
  }

  get player() {
    return this.players[this.local_id] || this.players[0];
  }

  get partySize() {
    return this.players.length;
  }

  // ------------------------------------------------------------- mensagens
  msg(text, color = C.WHITE) {
    this.messages.push([text, color]);
    if (this.messages.length > 80) this.messages.shift();
  }

  recent(count = 3) {
    return this.messages.slice(-count);
  }

  who(player) {
    return this.players.length > 1 ? `${player.name}: ` : "";
  }

  // ---------------------------------------------------------------- setor
  _generate_level(depth) {
    this._level_counter += 1;
    const lvl_rng = this.rng.fork(`lvl${this._level_counter}:${depth}`);
    return dungeon.generate(lvl_rng, depth, {
      partySize: this.players.length,
    });
  }

  alivePlayers() {
    return this.players.filter((player) => !player.dead);
  }

  activePlayers() {
    return this.players.filter((player) => !player.dead && player.connected);
  }

  _place_party(first = false, revive = true) {
    const spots = this.level.spawn_points || [this.level.stairs_up];
    for (const player of this.players) {
      if (player.dead && revive) {
        player.dead = false;
        player.hp = Math.max(1, Math.floor(player.max_hp * RESPAWN_HP_RATIO));
        if (!first) this.msg(`${player.name} REBOOTS AT THE SECTOR ENTRANCE.`, C.LGREEN);
      }
      const spot = spots[player.id % spots.length] || this.level.stairs_up;
      [player.x, player.y] = spot;
      player.depth = this.depth;
      player.acted = false;
      player.ready = false;
      player.memory = sonar.create_memory(this.level);
      sonar.reveal_circle(
        player.memory,
        player.x,
        player.y,
        PERSONAL_RADIUS,
        this.turn
      );
      if (player.diagnostic) {
        sonar.reveal_all(player.memory, this.turn);
      }
    }
  }

  enter_level(depth, first = false) {
    this.depth = depth;
    this.level = this._generate_level(depth);
    this.reset_used = false;
    this.beam = [];
    this._place_party(first);
    if (!first) this.msg(`THE PARTY DESCENDS TO SECTOR ${depth}.`, C.LGREEN);
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

  add_player(name) {
    if (this.over) return null;
    if (this.players.length >= MAX_PLAYERS) return null;
    const player = new Player(this.players.length, name);
    player.equipped.weapon = new Item("dagger");
    player.inventory.push(new Item("ruler"));
    player.depth = this.depth;
    this.players.push(player);
    const free = this.level.free_spot_near(this.level.stairs_up);
    [player.x, player.y] = free || this.level.stairs_up;
    player.acted = false;
    player.memory = sonar.create_memory(this.level);
    sonar.reveal_circle(
      player.memory,
      player.x,
      player.y,
      PERSONAL_RADIUS,
      this.turn
    );
    this.msg(`${player.name} JACKS INTO THE PARTY.`, C.LGREEN);
    return player;
  }

  remove_player(id) {
    const player = this.players.find((entry) => entry.id === id);
    if (!player) return;
    player.connected = false;
    this.msg(`${player.name} LOST THE SIGNAL. WAITING FOR RECONNECT.`, C.LRED);
  }

  // --------------------------------------------------------------- ruido
  add_noise(amount, source, player = this.player) {
    if (amount <= 0 || !player) return;
    player.noise = Math.min(NOISE_MAX, player.noise + amount);
    player.peak_noise = Math.max(player.peak_noise, player.noise);
    if (source) {
      this.noise_sources.set(player.id, [source[0], source[1]]);
      this.noise_source = [source[0], source[1]];
    }
  }

  // ---------------------------------------------------------------- turno
  /**
   * Turnos livres: cada acao resolve o mundo na hora, sem esperar a party.
   * O host serializa os turnos (um por intent), entao nao ha corrida.
   */
  resolve_party_turn(actor = this.player) {
    if (this.over) return;
    for (const [line, color] of ai.run_monsters(this)) this.msg(line, color);
    this._advance_turn(actor);
  }

  _advance_turn(actor = this.player) {
    this.turn += 1;
    for (const player of this.players) {
      if (player.dead) continue;
      if (player === actor) player.turns += 1;
      if (player.sonar_cooldown > 0) player.sonar_cooldown -= 1;
      player.noise = Math.max(0, player.noise - NOISE_DECAY);
      player.peak_noise = Math.max(player.peak_noise, player.noise);
      sonar.fade(player.memory, this.turn, player.memory_persists);
      sonar.reveal_circle(
        player.memory,
        player.x,
        player.y,
        PERSONAL_RADIUS,
        this.turn
      );
      player.acted = false;
      player.ready =
        player.x === this.level.stairs_down[0] &&
        player.y === this.level.stairs_down[1];
      if (player.hp <= 0 && !player.dead) this._kill(player, this.last_hit_by || "DARK");
    }
    this._check_party_wipe();
    this._check_descend();
  }

  _check_descend() {
    const alive = this.alivePlayers();
    if (alive.length === 0 || this.over) return;
    const down = this.level.stairs_down;
    // Qualquer operador na escada desce a party inteira (turnos livres).
    if (alive.some((player) => player.x === down[0] && player.y === down[1])) {
      this.descend();
    }
  }

  _kill(player, cause) {
    if (player.dead) return;
    player.dead = true;
    player.hp = 0;
    player.acted = true;
    player.cause = cause;
    this.msg(`${player.name} FALLS. REBOOT NEXT SECTOR.`, C.LRED);
    this._check_party_wipe();
  }

  _check_party_wipe() {
    if (this.over) return;
    if (this.players.every((player) => player.dead)) {
      this.over = true;
      this.cause = `THE PARTY WAS TAKEN BY THE ${this.last_hit_by || "DARK"}`;
    }
  }

  end_turn(player = this.player) {
    if (this.over) return;
    if (player.dead) return;
    player.acted = false;
    sonar.reveal_circle(
      player.memory,
      player.x,
      player.y,
      PERSONAL_RADIUS,
      this.turn
    );
    this.resolve_party_turn(player);
  }

  // ------------------------------------------------------------- comandos
  handle_key(kind, ch = "", player = this.player) {
    if (this.mode === "measure" && player === this.player) {
      if (kind === "escape") {
        this.mode = "play";
        return "ok";
      }
      const delta = DIR_BY_KEY[kind];
      if (delta) this.measure(delta[0], delta[1], player);
      return "ok";
    }

    if (DIR_BY_KEY[kind]) {
      this.move(...DIR_BY_KEY[kind], player);
      return "ok";
    }
    if (kind !== "char" || !ch) return "ok";

    const lower = ch.toLowerCase();
    if (lower === "s" || lower === "p") this.ping(player);
    else if (lower === "m") this.begin_measure(player);
    else if (lower === "l") this.lock_door(player);
    else if (lower === "u") this.unlock_door(player);
    else if (lower === "g") this.pickup(player);
    else if (lower === "d") return "drop";
    else if (lower === "i") return "inventory";
    else if (lower === "x") this.reset_sector(player);
    else if (lower === "b") this.brute_force(player);
    else if (lower === "q") return "title";
    else if (ch === "?") return "help";
    else if (ch === ".") this.wait(player);
    return "ok";
  }

  // ------------------------------------------------------------- movimento
  _player_at(x, y, ignore = null) {
    return (
      this.players.find(
        (player) => !player.dead && player !== ignore && player.x === x && player.y === y
      ) || null
    );
  }

  move(dx, dy, player = this.player) {
    if (this.over || player.dead) return;
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (!this.level.in_bounds(nx, ny)) return;

    const monster = this.level.monster_at(nx, ny);
    if (monster !== null) {
      this.player_attack(monster, player);
      this.end_turn(player);
      return;
    }

    const tile = this.level.tiles[ny][nx];
    if (tile.blocks()) {
      if (tile.is_door()) {
        if (tile.door === DOOR_CLOSED) {
          tile.door = DOOR_OPEN;
          this.add_noise(NOISE.lock, [nx, ny], player);
          this.msg(`${this.who(player)}OPENS THE DOOR.`);
          this.end_turn(player);
        } else if (
          this.level.password &&
          player.passwords.includes(this.level.password)
        ) {
          tile.door = DOOR_OPEN;
          this.add_noise(NOISE.lock, [nx, ny], player);
          this.msg(`${this.who(player)}SLATE ACCEPTED: ${this.level.password}.`, C.LGREEN);
          this.end_turn(player);
        } else {
          this.msg(`${this.who(player)}THE DOOR IS LOCKED. [B] FORCES IT.`, C.LRED);
        }
      }
      return;
    }

    player.x = nx;
    player.y = ny;
    this.add_noise(status.step_noise(player, this.level), [nx, ny], player);
    if (nx === this.level.stairs_down[0] && ny === this.level.stairs_down[1]) {
      // No co-op, quem alcanca a escada leva a party inteira para o proximo setor.
      this.descend();
    }
    this.end_turn(player);
  }

  wait(player = this.player) {
    this.msg(`${this.who(player)}WAITS.`);
    this.end_turn(player);
  }

  player_attack(monster, player = this.player) {
    const { damage, crit } = status.damage_to_monster(player, monster, this.rng);
    monster.hp -= damage;
    this.add_noise(NOISE.combat, [player.x, player.y], player);
    if (crit) {
      this.msg(`${this.who(player)}CRITICAL! ${monster.name} TAKES ${damage}.`, C.YELLOW);
    } else {
      this.msg(`${this.who(player)}HITS ${monster.name} FOR ${damage}.`);
    }
    sfx.hit();
    if (monster.hp <= 0) {
      monster.alive = false;
      player.kills += 1;
      this.msg(`${this.who(player)}${monster.name} IS DESTROYED.`, C.LGREEN);
      if (monster.behavior === "splitter") this._split_monster(monster);
    }
  }

  _split_monster(monster) {
    for (let i = 0; i < 2; i += 1) {
      const child = new Monster("rat", this.depth, this.rng);
      const spot = this.level.free_spot_near([monster.x, monster.y]);
      if (!spot) continue;
      [child.x, child.y] = spot;
      this.level.monsters.push(child);
    }
    this.msg("THE SLIME SPLITS IN TWO.", C.LRED);
  }

  // ---------------------------------------------------------------- sonar
  ping(player = this.player) {
    if (player.dead) return false;
    if (player.sonar_cooldown > 0) {
      this.msg(`${this.who(player)}SONAR RECHARGING (${player.sonar_cooldown} TURNS).`, C.LRED);
      return false;
    }
    const radius = status.sonar_radius(player);
    sonar.reveal_circle(player.memory, player.x, player.y, radius, this.turn);
    const amount = status.ping_noise(player);
    this.add_noise(amount, [player.x, player.y], player);
    player.sonar_cooldown = SONAR_COOLDOWN;
    this.msg(`${this.who(player)}SONAR PING. RADIUS ${radius}. NOISE +${amount}.`, C.LCYAN);
    sfx.ping();
    return true;
  }

  // ---------------------------------------------------------------- ruler
  begin_measure(player = this.player) {
    if (!player.has_ruler) {
      this.msg(`${this.who(player)}YOU CARRY NO RULER.`, C.LRED);
      return false;
    }
    this.mode = "measure";
    return true;
  }

  measure(dx, dy, player = this.player) {
    if (player.dead) return;
    const { distance, cells } = sonar.reveal_ray(
      player.memory,
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
    this.add_noise(NOISE.ruler, [player.x, player.y], player);
    this.msg(`${this.who(player)}RULER READS ${distance} TILES.`, C.LCYAN);
    sfx.blip();
    this.mode = "play";
    this.end_turn(player);
  }

  // ---------------------------------------------------------------- portas
  adjacent_doors(player = this.player) {
    const doors = [];
    for (const [dx, dy] of DIRS8) {
      const x = player.x + dx;
      const y = player.y + dy;
      const tile = this.level.tile(x, y);
      if (tile && tile.is_door()) doors.push({ tile, x, y });
    }
    return doors;
  }

  _adjacent_door(want = null, avoid = null, player = this.player) {
    for (const { tile } of this.adjacent_doors(player)) {
      if (want !== null && tile.door !== want) continue;
      if (avoid !== null && tile.door === avoid) continue;
      return tile;
    }
    return null;
  }

  lock_door(player = this.player) {
    if (player.dead) return false;
    if (this._adjacent_door(null, null, player) === null) {
      this.msg(`${this.who(player)}NO DOOR BESIDE YOU.`);
      return false;
    }
    const tile = this._adjacent_door(null, DOOR_LOCKED, player);
    if (tile === null) {
      this.msg(`${this.who(player)}EVERY DOOR BESIDE YOU IS ALREADY LOCKED.`);
      return false;
    }
    tile.door = DOOR_LOCKED;
    this.add_noise(NOISE.lock, [player.x, player.y], player);
    this.msg(`${this.who(player)}LOCKS THE DOOR.`);
    sfx.door();
    this.end_turn(player);
    return true;
  }

  unlock_door(player = this.player) {
    if (player.dead) return false;
    const tile = this._adjacent_door(DOOR_LOCKED, null, player);
    if (tile === null) {
      this.msg(`${this.who(player)}NO LOCKED DOOR BESIDE YOU.`);
      return false;
    }
    tile.door = DOOR_OPEN;
    if (player.kernel) {
      this.msg(`${this.who(player)}KERNEL UNLOCKS IT SILENTLY.`, C.LGREEN);
    } else {
      this.add_noise(NOISE.unlock, [player.x, player.y], player);
      this.msg(`${this.who(player)}UNLOCKS THE DOOR.`);
      sfx.door();
    }
    this.end_turn(player);
    return true;
  }

  brute_force(player = this.player) {
    if (player.dead) return false;
    const tile = this._adjacent_door(DOOR_LOCKED, null, player);
    if (tile === null) {
      this.msg(`${this.who(player)}NO LOCKED DOOR BESIDE YOU.`);
      return false;
    }
    tile.brute += 1;
    this.add_noise(NOISE.brute, [player.x, player.y], player);
    if (tile.brute >= 3) {
      this.add_noise(NOISE.purge, [player.x, player.y], player);
      this.msg("SYSTEM PURGE! THE DOOR EXPLODES.", C.LRED);
      tile.door = DOOR_OPEN;
      tile.brute = 0;
      this._spawn_purge_monsters(player);
    } else {
      this.msg(`${this.who(player)}THE DOOR HOLDS. ATTEMPT ${tile.brute} OF 3.`, C.LRED);
    }
    sfx.error();
    this.end_turn(player);
    return true;
  }

  _spawn_purge_monsters(player = this.player) {
    for (let i = 0; i < 2; i += 1) {
      const kind = this.rng.choice(["rat", "bat", "goblin"]);
      const monster = new Monster(kind, this.depth, this.rng);
      const spots = DIRS8.map(([dx, dy]) => [player.x + dx, player.y + dy]).filter(
        ([x, y]) =>
          this.level.in_bounds(x, y) &&
          this.level.is_passable(x, y) &&
          !this._player_at(x, y)
      );
      if (spots.length === 0) continue;
      [monster.x, monster.y] = this.rng.choice(spots);
      this.level.monsters.push(monster);
    }
  }

  // ------------------------------------------------------------------ itens
  pickup(player = this.player) {
    if (player.dead) return;
    const rom = this.level.rom_at(player.x, player.y);
    if (rom !== null) {
      this.read_rom(rom, player);
      return;
    }
    const item = this.level.item_at(player.x, player.y);
    if (item === null) {
      this.msg(`${this.who(player)}NOTHING TO TAKE HERE.`);
      return;
    }
    if (player.load + item.kg > player.capacity) {
      this.msg(`${this.who(player)}TOO HEAVY. LOSE SOMETHING FIRST.`, C.LRED);
      return;
    }
    this.level.items.splice(this.level.items.indexOf(item), 1);
    if (item.category === "weapon") {
      const current = player.equipped.weapon;
      if (current === null || (item.data.atk || 0) > (current.data.atk || 0)) {
        if (current !== null) player.inventory.push(current);
        player.equipped.weapon = item;
        this.msg(`${this.who(player)}EQUIPS THE ${item.name}.`, C.LGREEN);
      } else {
        player.inventory.push(item);
        this.msg(`${this.who(player)}TAKES THE ${item.name}.`);
      }
    } else if (item.category === "armor") {
      const current = player.equipped.armor;
      if (current === null || (item.data.dfn || 0) > (current.data.dfn || 0)) {
        if (current !== null) player.inventory.push(current);
        player.equipped.armor = item;
        this.msg(`${this.who(player)}EQUIPS THE ${item.name}.`, C.LGREEN);
      } else {
        player.inventory.push(item);
        this.msg(`${this.who(player)}TAKES THE ${item.name}.`);
      }
    } else {
      player.inventory.push(item);
      this.msg(`${this.who(player)}TAKES THE ${item.name}.`);
    }
    sfx.pickup();
    this.end_turn(player);
  }

  equip(item, player = this.player) {
    const slot =
      item.category === "weapon"
        ? "weapon"
        : item.category === "armor"
          ? "armor"
          : null;
    if (slot === null) return false;
    const index = player.inventory.indexOf(item);
    if (index < 0) return false;
    player.inventory.splice(index, 1);
    const current = player.equipped[slot];
    player.equipped[slot] = item;
    if (current) player.inventory.push(current);
    this.msg(`${this.who(player)}EQUIPS THE ${item.name}.`, C.LGREEN);
    this.end_turn(player);
    return true;
  }

  drop_item(item, player = this.player) {
    const index = player.inventory.indexOf(item);
    if (index >= 0) player.inventory.splice(index, 1);
    item.x = player.x;
    item.y = player.y;
    this.level.items.push(item);
    this.msg(`${this.who(player)}DROPS THE ${item.name}.`);
    this.end_turn(player);
    return true;
  }

  use_item(item, player = this.player) {
    const data = item.data;
    if (item.category !== "consumable") {
      this.msg(`${this.who(player)}THE ${item.name} CANNOT BE USED.`);
      return false;
    }
    if (data.heal) {
      player.hp = Math.min(player.max_hp, player.hp + data.heal);
      this.msg(`${this.who(player)}THE ${item.name} HEALS ${data.heal} HP.`, C.LGREEN);
    }
    if (data.noise) {
      player.noise = Math.max(0, player.noise + data.noise);
      this.msg(`${this.who(player)}THE ${item.name} SHIFTS NOISE BY ${data.noise}.`);
    }
    if (data.stun) {
      const radius = data.stun;
      let count = 0;
      for (const monster of this.level.monsters) {
        if (monster.alive && monster.distance_to(player.x, player.y) <= radius) {
          monster.stun = 3;
          count += 1;
        }
      }
      this.add_noise(data.noise || 0, [player.x, player.y], player);
      this.msg(`${this.who(player)}THE ${item.name} STUNS ${count} THING(S).`, C.LCYAN);
    }
    const index = player.inventory.indexOf(item);
    if (index >= 0) player.inventory.splice(index, 1);
    this.end_turn(player);
    return true;
  }

  // ------------------------------------------------------------------- ROM
  read_rom(rom, player = this.player) {
    if (player.free_rom_slots <= 0) {
      this.msg(`${this.who(player)}NO FREE ROM SLOT. CHOOSE ONE TO OVERWRITE.`, C.LRED);
      return false;
    }
    this.install_rom(rom, player);
    return true;
  }

  install_rom(rom, player = this.player) {
    const index = this.level.roms_on_floor.indexOf(rom);
    if (index >= 0) this.level.roms_on_floor.splice(index, 1);
    player.roms.push(rom);
    status.apply_rom(player, rom);
    this.msg(`${this.who(player)}ROM ${rom.name} READ. ${rom.desc}.`, C.YELLOW);
    if (player.diagnostic) sonar.reveal_all(player.memory, this.turn);
    sfx.rom();
    this.end_turn(player);
  }

  overwrite_rom(old_rom, new_rom, player = this.player) {
    const index = player.roms.indexOf(old_rom);
    if (index >= 0) player.roms.splice(index, 1);
    this.install_rom(new_rom, player);
  }

  // ------------------------------------------------------------------ reset
  reset_sector(player = this.player) {
    if (this.reset_used) {
      this.msg("RESET ALREADY USED IN THIS SECTOR.", C.LRED);
      return false;
    }
    this.reset_used = true;
    this.alert += 1;
    player.alert += 1;
    player.resets += 1;
    this.level = this._generate_level(this.depth);
    this._place_party(false, false);
    this.beam = [];
    this.msg(`RESET. SECTOR REGENERATED. ALERT IS NOW ${this.alert}.`, C.LRED);
    sfx.error();
    this.end_turn(player);
    return true;
  }
}
