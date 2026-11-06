/**
 * Protocolo host <-> cliente e visao de cliente (sem DOM).
 * O host e autoritativo; o cliente so envia intencoes e aplica estados.
 */

import { MAX_DEPTH, MONSTERS } from "./data.js";
import { Item, Player, Rom } from "./entities.js";
import { Level, Tile } from "./dungeon.js";
import * as sonar from "./sonar.js";
import * as status from "./status.js";
import { Rng } from "./rng.js";

export const PROTOCOL_VERSION = 1;

function encode_tile(tile) {
  if (tile.kind === "wall") return "#";
  if (tile.kind === "floor") return ".";
  if (tile.door === "locked") return "L";
  if (tile.door === "closed") return "D";
  return "+";
}

function decode_tile(ch) {
  if (ch === "#") return new Tile("wall");
  if (ch === ".") return new Tile("floor");
  if (ch === "L") return new Tile("door", "locked");
  if (ch === "D") return new Tile("door", "closed");
  return new Tile("door", "open");
}

function serialize_item(item) {
  return { k: item.kind, p: item.payload || null, x: item.x, y: item.y };
}

function hydrate_item(data) {
  const item = new Item(data.k, 1, data.p);
  item.x = data.x;
  item.y = data.y;
  return item;
}

function serialize_rom(rom) {
  return { id: rom.id, x: rom.x, y: rom.y };
}

function hydrate_rom(data) {
  const rom = new Rom(data.id);
  rom.x = data.x;
  rom.y = data.y;
  return rom;
}

function serialize_monster(monster) {
  return {
    k: monster.kind,
    name: monster.name,
    glyph: monster.glyph,
    color: monster.color,
    x: monster.x,
    y: monster.y,
    hp: monster.hp,
    max_hp: monster.max_hp,
    atk: monster.atk,
    dfn: monster.dfn,
    alive: monster.alive,
    elite: Boolean(monster.elite),
    behavior: monster.behavior,
  };
}

function public_player(player) {
  return {
    id: player.id,
    name: player.name,
    glyph: player.glyph,
    color: player.color,
    x: player.x,
    y: player.y,
    hp: player.hp,
    max_hp: player.max_hp,
    atk: player.atk,
    dfn: player.dfn,
    noise: player.noise,
    alert: player.alert,
    dead: player.dead,
    acted: player.acted,
    connected: player.connected,
    kills: player.kills,
    turns: player.turns,
    peak_noise: player.peak_noise,
    resets: player.resets,
    capacity: player.capacity,
    load: player.load,
  };
}

function local_payload(player) {
  return {
    id: player.id,
    name: player.name,
    glyph: player.glyph,
    color: player.color,
    x: player.x,
    y: player.y,
    depth: player.depth,
    hp: player.hp,
    max_hp: player.max_hp,
    base_atk: player.base_atk,
    base_dfn: player.base_dfn,
    noise: player.noise,
    alert: player.alert,
    turns: player.turns,
    kills: player.kills,
    peak_noise: player.peak_noise,
    resets: player.resets,
    sonar_cooldown: player.sonar_cooldown,
    dead: player.dead,
    acted: player.acted,
    connected: player.connected,
    inventory: player.inventory.map(serialize_item),
    equipped: {
      weapon: player.equipped.weapon ? serialize_item(player.equipped.weapon) : null,
      armor: player.equipped.armor ? serialize_item(player.equipped.armor) : null,
    },
    roms: player.roms.map((rom) => rom.id),
  };
}

function doors_of(level) {
  const doors = [];
  for (let y = 0; y < level.h; y += 1) {
    for (let x = 0; x < level.w; x += 1) {
      const tile = level.tiles[y][x];
      if (!tile.is_door()) continue;
      doors.push({ x, y, d: tile.door, b: tile.brute });
    }
  }
  return doors;
}

export function serialize_snapshot(game, forId) {
  const local =
    game.players.find((player) => player.id === forId) || game.players[0];
  return {
    t: "snapshot",
    type: "snapshot",
    v: PROTOCOL_VERSION,
    seed: game.seed,
    depth: game.depth,
    turn: game.turn,
    localId: local.id,
    w: game.level.w,
    h: game.level.h,
    terrain: game.level.tiles.map((row) => row.map(encode_tile).join("")),
    stairs_up: game.level.stairs_up,
    stairs_down: game.level.stairs_down,
    password: game.level.password,
    items: game.level.items.map(serialize_item),
    roms: game.level.roms_on_floor.map(serialize_rom),
    monsters: game.level.monsters.map(serialize_monster),
    players: game.players.map(public_player),
    you: local_payload(local),
    memory: sonar.keyframe(local.memory),
    messages: game.messages.slice(-40),
    beam: game.beam,
    beam_turn: game.beam_turn,
    reset_used: game.reset_used,
    alert: game.alert,
    over: game.over,
    victory: game.victory,
    cause: game.cause,
  };
}

export function serialize_state(game, forId) {
  const local =
    game.players.find((player) => player.id === forId) || game.players[0];
  return {
    t: "state",
    type: "state",
    v: PROTOCOL_VERSION,
    depth: game.depth,
    turn: game.turn,
    players: game.players.map(public_player),
    items: game.level.items.map(serialize_item),
    roms: game.level.roms_on_floor.map(serialize_rom),
    monsters: game.level.monsters.map(serialize_monster),
    doors: doors_of(game.level),
    you: local_payload(local),
    vision: sonar.take_delta(local.memory),
    messages: game.messages.slice(-8),
    beam: game.beam,
    beam_turn: game.beam_turn,
    reset_used: game.reset_used,
    alert: game.alert,
    over: game.over,
    victory: game.victory,
    cause: game.cause,
  };
}

const DIRS8 = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function hydrate_public(data) {
  const player = new Player(data.id, data.name);
  player.glyph = data.glyph;
  player.color = data.color;
  player.x = data.x;
  player.y = data.y;
  player.hp = data.hp;
  player.max_hp = data.max_hp;
  player.noise = data.noise;
  player.alert = data.alert;
  player.dead = data.dead;
  player.acted = data.acted;
  player.connected = data.connected;
  player.kills = data.kills;
  player.turns = data.turns;
  player.peak_noise = data.peak_noise;
  player.resets = data.resets;
  return player;
}

function hydrate_local(data) {
  const player = new Player(data.id, data.name);
  player.glyph = data.glyph || player.glyph;
  player.color = data.color || player.color;
  player.x = data.x || 0;
  player.y = data.y || 0;
  player.depth = data.depth || 1;
  player.hp = data.hp;
  player.max_hp = data.max_hp;
  player.base_atk = data.base_atk;
  player.base_dfn = data.base_dfn;
  player.noise = data.noise;
  player.alert = data.alert;
  player.turns = data.turns;
  player.kills = data.kills;
  player.peak_noise = data.peak_noise;
  player.resets = data.resets;
  player.sonar_cooldown = data.sonar_cooldown;
  player.dead = data.dead;
  player.acted = Boolean(data.acted);
  player.connected = data.connected !== false;
  player.inventory = data.inventory.map(hydrate_item);
  player.equipped.weapon = data.equipped.weapon
    ? hydrate_item(data.equipped.weapon)
    : null;
  player.equipped.armor = data.equipped.armor
    ? hydrate_item(data.equipped.armor)
    : null;
  player.roms = data.roms.map((id) => new Rom(id));
  for (const rom of player.roms) status.apply_rom(player, rom);
  return player;
}

export class ClientGame {
  constructor(snapshot, send) {
    this.send = send;
    this.seed = snapshot.seed;
    this.local_id = snapshot.localId;
    this.depth = snapshot.depth;
    this.turn = snapshot.turn;
    this.level = new Level(snapshot.w, snapshot.h);
    this.level.tiles = snapshot.terrain.map((row) =>
      Array.from(row, decode_tile)
    );
    this.level.stairs_up = snapshot.stairs_up;
    this.level.stairs_down = snapshot.stairs_down;
    this.level.password = snapshot.password;
    this.level.items = snapshot.items.map(hydrate_item);
    this.level.roms_on_floor = snapshot.roms.map(hydrate_rom);
    this.level.monsters = snapshot.monsters.map((m) => ({ ...m }));
    this.players = snapshot.players.map(hydrate_public);
    const local = hydrate_local(snapshot.you);
    local.memory = sonar.create_memory(this.level);
    sonar.apply_keyframe(local.memory, snapshot.memory);
    this.players[this.local_id] = local;
    this.messages = snapshot.messages.slice();
    this.beam = snapshot.beam || [];
    this.beam_turn = snapshot.beam_turn;
    this.reset_used = snapshot.reset_used;
    this.alert = snapshot.alert || 0;
    this.over = snapshot.over;
    this.victory = snapshot.victory;
    this.cause = snapshot.cause;
    this.mode = "play";
    this.partyMode = true;
  }

  get player() {
    return this.players[this.local_id] || this.players[0];
  }

  get partySize() {
    return this.players.length;
  }

  msg(text, color = 7) {
    this.messages.push([text, color]);
    if (this.messages.length > 80) this.messages.shift();
  }

  recent(count = 3) {
    return this.messages.slice(-count);
  }

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

  applyState(state) {
    if (!state || state.v !== PROTOCOL_VERSION) return;
    this.depth = state.depth;
    this.turn = state.turn;
    const oldHp = this.player.hp;
    const oldMemory = this.player.memory;
    this.players = state.players.map(hydrate_public);
    const local = hydrate_local(state.you);
    local.memory = oldMemory || sonar.create_memory(this.level);
    if (state.vision) sonar.apply_delta(local.memory, state.vision);
    this.players[this.local_id] = local;
    this.level.items = state.items.map(hydrate_item);
    this.level.roms_on_floor = state.roms.map(hydrate_rom);
    this.level.monsters = state.monsters.map((m) => ({ ...m }));
    for (const door of state.doors || []) {
      const tile = this.level.tile(door.x, door.y);
      if (tile) {
        tile.kind = "door";
        tile.door = door.d;
        tile.brute = door.b;
      }
    }
    this.messages = state.messages.slice();
    this.beam = state.beam || [];
    this.beam_turn = state.beam_turn;
    this.reset_used = state.reset_used;
    this.alert = state.alert || 0;
    this.over = state.over;
    this.victory = state.victory;
    this.cause = state.cause;
    return local.hp < oldHp;
  }

  // Intencoes: o host valida e aplica.
  move(dx, dy) {
    this.send({ a: "move", dx, dy });
  }
  ping() {
    this.send({ a: "ping" });
    return true;
  }
  begin_measure() {
    if (!this.player.has_ruler) return false;
    this.mode = "measure";
    return true;
  }
  measure(dx, dy) {
    this.mode = "play";
    this.send({ a: "measure", dx, dy });
  }
  lock_door() {
    this.send({ a: "lock" });
    return true;
  }
  unlock_door() {
    this.send({ a: "unlock" });
    return true;
  }
  brute_force() {
    this.send({ a: "brute" });
    return true;
  }
  pickup() {
    this.send({ a: "pickup" });
  }
  wait() {
    this.send({ a: "wait" });
  }
  reset_sector() {
    this.send({ a: "reset" });
    return true;
  }
  read_rom(rom) {
    const index = this.level.roms_on_floor.indexOf(rom);
    if (index >= 0) this.send({ a: "read_rom", index });
    return true;
  }
  install_rom(rom) {
    this.read_rom(rom);
  }
  overwrite_rom(oldRom, newRom) {
    const oldIndex = this.player.roms.indexOf(oldRom);
    const index = this.level.roms_on_floor.indexOf(newRom);
    if (index >= 0) this.send({ a: "read_rom", index, overwrite: oldIndex });
  }
  equip(item) {
    const index = this.player.inventory.indexOf(item);
    if (index >= 0) this.send({ a: "equip", index });
    return true;
  }
  drop_item(item) {
    const index = this.player.inventory.indexOf(item);
    if (index >= 0) this.send({ a: "drop", index });
    return true;
  }
  use_item(item) {
    const index = this.player.inventory.indexOf(item);
    if (index >= 0) this.send({ a: "use", index });
    return true;
  }

  handle_key(kind, ch = "") {
    if (this.mode === "measure") {
      if (kind === "escape") {
        this.mode = "play";
        return "ok";
      }
      const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      if (dirs[kind]) this.measure(...dirs[kind]);
      return "ok";
    }
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    if (dirs[kind]) {
      this.move(...dirs[kind]);
      return "ok";
    }
    if (kind !== "char" || !ch) return "ok";
    const lower = ch.toLowerCase();
    if (lower === "s" || lower === "p") this.ping();
    else if (lower === "m") this.begin_measure();
    else if (lower === "l") this.lock_door();
    else if (lower === "u") this.unlock_door();
    else if (lower === "g") this.pickup();
    else if (lower === "d") return "drop";
    else if (lower === "i") return "inventory";
    else if (lower === "b") this.brute_force();
    else if (lower === "x") this.reset_sector();
    else if (lower === "q") return "title";
    else if (ch === "?") return "help";
    else if (ch === ".") this.wait();
    return "ok";
  }
}

export const DEPTH = MAX_DEPTH;
export { Rng, MONSTERS };
