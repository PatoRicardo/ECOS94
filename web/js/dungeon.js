/**
 * Geracao de setor: salas, corredores, portas, loot e monstros.
 *
 * Garantias de geracao (verificadas por tests/simulate.mjs):
 *   - a escada de descida e sempre alcancavel sem destrancar nada
 *   - o SLATE (com a senha) fica sempre numa sala alcancavel
 *   - a porta trancada existe a partir do setor 2 e guarda algo
 */

import {
  DOOR_CLOSED,
  DOOR_LOCKED,
  DOOR_OPEN,
  PASSWORD_WORDS,
  ROMS,
  SPAWN_TABLE,
} from "./data.js";
import { Item, Monster, Rom } from "./entities.js";

export const DIRS4 = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

export class Tile {
  constructor(kind = "wall", door = null) {
    this.kind = kind; // 'wall' | 'floor' | 'door'
    this.door = door; // null | 'open' | 'closed' | 'locked'
    this.brute = 0; // tentativas de forca bruta nesta porta
  }

  is_wall() {
    return this.kind === "wall";
  }

  /** Porta fechada ou trancada bloqueia o caminho. */
  blocks() {
    if (this.kind === "wall") return true;
    if (this.kind === "door") {
      return this.door === DOOR_CLOSED || this.door === DOOR_LOCKED;
    }
    return false;
  }

  is_door() {
    return this.kind === "door";
  }
}

export class Room {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  get cx() {
    return this.x + Math.floor(this.w / 2);
  }

  get cy() {
    return this.y + Math.floor(this.h / 2);
  }

  intersects(other, pad = 1) {
    return !(
      this.x - pad > other.x + other.w - 1 ||
      other.x - pad > this.x + this.w - 1 ||
      this.y - pad > other.y + other.h - 1 ||
      other.y - pad > this.y + this.h - 1
    );
  }

  /** Uma posicao de chao realmente livre (nao porta, sem monstro). */
  free_floor(level, rng, tries = 40) {
    for (let i = 0; i < tries; i += 1) {
      const x = rng.randint(this.x, this.x + this.w - 1);
      const y = rng.randint(this.y, this.y + this.h - 1);
      if (!level.in_bounds(x, y)) continue;
      if (level.tiles[y][x].kind !== "floor") continue;
      if (level.monster_at(x, y) !== null) continue;
      return [x, y];
    }
    return null;
  }
}

export class Level {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.tiles = Array.from({ length: h }, () =>
      Array.from({ length: w }, () => new Tile("wall"))
    );
    this.rooms = [];
    this.items = [];
    this.roms_on_floor = [];
    this.monsters = [];
    this.stairs_up = [0, 0];
    this.stairs_down = [0, 0];
    this.password = null;
    this.known = Array.from({ length: h }, () => new Array(w).fill(0));
    this.lit_at = Array.from({ length: h }, () => new Array(w).fill(-1));
  }

  // ------------------------------------------------------------- consultas
  in_bounds(x, y) {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }

  tile(x, y) {
    if (!this.in_bounds(x, y)) return null;
    return this.tiles[y][x];
  }

  is_wall(x, y) {
    const t = this.tile(x, y);
    return t === null || t.is_wall();
  }

  is_passable(x, y) {
    const t = this.tile(x, y);
    if (t === null) return false;
    return !t.blocks();
  }

  monster_at(x, y) {
    for (const monster of this.monsters) {
      if (monster.alive && monster.x === x && monster.y === y) return monster;
    }
    return null;
  }

  item_at(x, y) {
    for (const item of this.items) {
      if (item.x === x && item.y === y) return item;
    }
    return null;
  }

  rom_at(x, y) {
    for (const rom of this.roms_on_floor) {
      if (rom.x === x && rom.y === y) return rom;
    }
    return null;
  }

  *floor_positions() {
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        if (this.tiles[y][x].kind === "floor") yield [x, y];
      }
    }
  }
}

// ------------------------------------------------------------------ helpers
function key(x, y) {
  return `${x},${y}`;
}

/** Celulas alcancaveis a partir de start (4 direcoes). */
export function reachable_tiles(level, start, locked_open = false) {
  if (!level.in_bounds(start[0], start[1])) return new Set();
  const seen = new Set([key(start[0], start[1])]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head];
    head += 1;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (!level.in_bounds(nx, ny)) continue;
      const tile = level.tiles[ny][nx];
      if (tile.kind === "wall") continue;
      if (tile.is_door() && tile.door === DOOR_LOCKED && !locked_open) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

function carve_room(level, room) {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      level.tiles[y][x] = new Tile("floor");
    }
  }
}

/** Corredor em L: horizontal depois vertical. */
function carve_corridor(level, a, b) {
  let [x, y] = a;
  const [bx, by] = b;
  while (x !== bx) {
    x += bx > x ? 1 : -1;
    level.tiles[y][x] = new Tile("floor");
  }
  while (y !== by) {
    y += by > y ? 1 : -1;
    level.tiles[y][x] = new Tile("floor");
  }
}

/** Corredor reto (horizontal ou vertical) entre dois pontos. */
function carve_line(level, a, b) {
  let [x, y] = a;
  const [bx, by] = b;
  const step_x = x === bx ? 0 : bx > x ? 1 : -1;
  const step_y = y === by ? 0 : by > y ? 1 : -1;
  for (;;) {
    level.tiles[y][x] = new Tile("floor");
    if (x === bx && y === by) break;
    x += step_x;
    y += step_y;
  }
}

/** True se o retangulo sobrepoe alguma sala existente. */
function area_taken(level, x0, y0, x1, y1, ignore) {
  for (const room of level.rooms) {
    if (room === ignore) continue;
    if (
      !(
        x1 < room.x ||
        room.x + room.w - 1 < x0 ||
        y1 < room.y ||
        room.y + room.h - 1 < y0
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Cria um cofre lateral: alcovao opcional com uma porta trancada.
 * O cofre fica a tres tiles da sala hospedeira, entao trancar a porta
 * dele nunca bloqueia o caminho principal do setor.
 */
function make_vault(level, rng, host) {
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  rng.shuffle(dirs);
  for (const [dx, dy] of dirs) {
    let exit_x;
    let exit_y;
    if (dx === 0) {
      exit_x = host.cx;
      exit_y = dy < 0 ? host.y - 1 : host.y + host.h;
    } else {
      exit_x = dx < 0 ? host.x - 1 : host.x + host.w;
      exit_y = host.cy;
    }

    const front_x = exit_x + dx * 2;
    const front_y = exit_y + dy * 2;

    let rx0;
    let rx1;
    let ry0;
    let ry1;
    if (dx === 0) {
      rx0 = host.cx - 1;
      rx1 = host.cx + 1;
      [ry0, ry1] = dy < 0 ? [front_y - 2, front_y] : [front_y, front_y + 2];
    } else {
      ry0 = host.cy - 1;
      ry1 = host.cy + 1;
      [rx0, rx1] = dx < 0 ? [front_x - 2, front_x] : [front_x, front_x + 2];
    }

    if (rx0 < 1 || ry0 < 1 || rx1 > level.w - 2 || ry1 > level.h - 2) continue;
    if (area_taken(level, rx0, ry0, rx1, ry1, host)) continue;
    if (
      area_taken(
        level,
        Math.min(exit_x, front_x),
        Math.min(exit_y, front_y),
        Math.max(exit_x, front_x),
        Math.max(exit_y, front_y),
        host
      )
    ) {
      continue;
    }
    // O cofre precisa ser territorio virgem: parede em todos os tiles.
    // Sem isso a porta do cofre cairia em cima de um corredor principal.
    let virgin = true;
    for (let y = ry0; y <= ry1 && virgin; y += 1) {
      for (let x = rx0; x <= rx1; x += 1) {
        if (!level.tiles[y][x].is_wall()) {
          virgin = false;
          break;
        }
      }
    }
    if (!virgin) continue;

    carve_line(level, [exit_x, exit_y], [front_x, front_y]);
    for (let y = ry0; y <= ry1; y += 1) {
      for (let x = rx0; x <= rx1; x += 1) {
        level.tiles[y][x] = new Tile("floor");
      }
    }
    // A porta fica na entrada do cofre: bloqueia so o cofre.
    level.tiles[front_y][front_x] = new Tile("door", DOOR_LOCKED);
    return [
      [front_x, front_y],
      [rx0, ry0, rx1, ry1],
    ];
  }
  return [null, null];
}

/** Tiles internos de sala cujo vizinho externo e corredor. */
function door_candidates(level) {
  const candidates = [];
  for (const room of level.rooms) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      for (const y of [room.y - 1, room.y + room.h]) {
        if (level.in_bounds(x, y) && !level.is_wall(x, y)) {
          const inner_y = y === room.y - 1 ? room.y : room.y + room.h - 1;
          candidates.push([x, inner_y]);
        }
      }
    }
    for (let y = room.y; y < room.y + room.h; y += 1) {
      for (const x of [room.x - 1, room.x + room.w]) {
        if (level.in_bounds(x, y) && !level.is_wall(x, y)) {
          const inner_x = x === room.x - 1 ? room.x : room.x + room.w - 1;
          candidates.push([inner_x, y]);
        }
      }
    }
  }
  return candidates;
}

function place_doors(level, rng, want_locked) {
  const candidates = door_candidates(level);
  rng.shuffle(candidates);
  const limit = 2 + rng.randint(0, 2);
  const placed = [];
  for (const [x, y] of candidates) {
    if (placed.length >= limit) break;
    const tile = level.tiles[y][x];
    if (tile.kind !== "floor") continue;
    tile.kind = "door";
    tile.door = DOOR_CLOSED;
    placed.push([x, y]);
  }
  if (!want_locked || placed.length === 0) return;
  // Tranca a primeira porta que NAO impedir a chegada as escadas de descida.
  for (const [x, y] of placed) {
    level.tiles[y][x].door = DOOR_LOCKED;
    if (reachable_tiles(level, level.stairs_up).has(key(...level.stairs_down))) {
      return;
    }
    level.tiles[y][x].door = DOOR_CLOSED;
  }
}

/** Destranca portas ate a escada de descida ficar alcancavel. */
function ensure_reachable(level, protected_cells = new Set()) {
  for (let attempt = 0; attempt < level.rooms.length + 3; attempt += 1) {
    if (reachable_tiles(level, level.stairs_up).has(key(...level.stairs_down))) {
      return;
    }
    let unlocked = false;
    for (let y = 0; y < level.h && !unlocked; y += 1) {
      for (let x = 0; x < level.w; x += 1) {
        const tile = level.tiles[y][x];
        if (protected_cells.has(key(x, y))) continue;
        if (tile.is_door() && tile.door === DOOR_LOCKED) {
          tile.door = DOOR_CLOSED;
          unlocked = true;
          break;
        }
      }
    }
    if (!unlocked) return;
  }
}

function item_table(depth) {
  const table = [
    ["dagger", 26],
    ["ampola", 34],
    ["ruler", 16],
    ["plate", 14],
  ];
  if (depth >= 3) {
    table.push(["cleaver", 16], ["damper", 18], ["shocker", 12]);
  } else {
    table.push(["damper", 8]);
  }
  return table;
}

function place_loot(level, rng, depth, vault_rect = null) {
  if (level.rooms.length === 0) return;

  const open_set = reachable_tiles(level, level.stairs_up);
  const vault_set = reachable_tiles(level, level.stairs_up, true);

  let open_rooms = level.rooms.filter((r) => open_set.has(key(r.cx, r.cy)));
  let vault_rooms = level.rooms.filter(
    (r) => vault_set.has(key(r.cx, r.cy)) && !open_set.has(key(r.cx, r.cy))
  );
  if (open_rooms.length === 0) open_rooms = [...level.rooms];
  if (vault_rooms.length === 0) vault_rooms = [...level.rooms];

  // Itens comuns: em qualquer sala, exceto a inicial.
  const pool = level.rooms.filter((r) => r !== level.rooms[0]);
  const rooms_pool = pool.length ? pool : [...level.rooms];
  const count = 8 + depth + rng.randint(0, 2);
  for (let index = 0; index < count; index += 1) {
    const room = rng.choice(rooms_pool);
    const spot = room.free_floor(level, rng);
    if (!spot) continue;
    // Garante pelo menos uma arma logo nos primeiros setores.
    let kind;
    if (index === 0 && depth <= 3) {
      kind = depth < 3 ? "dagger" : rng.choice(["dagger", "cleaver"]);
    } else {
      kind = rng.weighted(item_table(depth));
    }
    const item = new Item(kind);
    [item.x, item.y] = spot;
    level.items.push(item);
  }

  // SLATE: sempre numa sala alcancavel sem destrancar.
  level.password = rng.choice(PASSWORD_WORDS);
  let slate_rooms = open_rooms.filter((r) => r !== level.rooms[0]);
  if (slate_rooms.length === 0) slate_rooms = open_rooms;
  for (const room of rng.sample(slate_rooms, slate_rooms.length)) {
    const spot = room.free_floor(level, rng);
    if (!spot) continue;
    const slate = new Item("slate", 1, level.password);
    [slate.x, slate.y] = spot;
    level.items.push(slate);
    break;
  }

  // ROM: preferencialmente dentro do cofre trancado.
  if (depth >= 2 && depth <= 7) {
    let spot = null;
    if (vault_rect) {
      const [rx0, ry0, rx1, ry1] = vault_rect;
      const spots = [];
      for (let y = ry0; y <= ry1; y += 1) {
        for (let x = rx0; x <= rx1; x += 1) {
          if (level.tiles[y][x].kind === "floor") spots.push([x, y]);
        }
      }
      if (spots.length) spot = rng.choice(spots);
    }
    if (!spot) {
      for (const room of rng.sample(vault_rooms, vault_rooms.length)) {
        spot = room.free_floor(level, rng);
        if (spot) break;
      }
    }
    if (spot) {
      const rom = new Rom(rng.choice(ROMS).id);
      [rom.x, rom.y] = spot;
      level.roms_on_floor.push(rom);
    }
  }
}

function place_monsters(level, rng, depth) {
  if (level.rooms.length < 2) return;
  const pool = level.rooms.slice(1);
  const table = SPAWN_TABLE[Math.min(depth, 10)] || SPAWN_TABLE[10];
  let count;
  if (depth >= 10) {
    // Ultimo setor: arena do chefe, nao um formigueiro.
    count = 2 + rng.randint(0, 1);
  } else {
    count = 2 + Math.floor(depth / 2) + rng.randint(0, 2);
  }
  for (let i = 0; i < count; i += 1) {
    const room = rng.choice(pool);
    const spot = room.free_floor(level, rng);
    if (!spot) continue;
    const monster = new Monster(rng.choice(table), depth, rng);
    [monster.x, monster.y] = spot;
    level.monsters.push(monster);
  }
  if (depth === 10) {
    const boss = new Monster("devourer", depth, rng);
    boss.x = level.rooms[level.rooms.length - 1].cx;
    boss.y = level.rooms[level.rooms.length - 1].cy;
    level.monsters.push(boss);
  }
}

/** Cria um setor completo para a profundidade informada. */
export function generate(rng, depth) {
  const w = rng.randint(46, 72);
  const h = rng.randint(30, 48);
  const level = new Level(w, h);

  const target_rooms = Math.min(9, 4 + Math.floor(depth / 2));
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (level.rooms.length >= target_rooms) break;
    const rw = rng.randint(5, 11);
    const rh = rng.randint(4, 8);
    const rx = rng.randint(1, w - rw - 2);
    const ry = rng.randint(1, h - rh - 2);
    const room = new Room(rx, ry, rw, rh);
    if (level.rooms.some((other) => room.intersects(other, 1))) continue;
    level.rooms.push(room);
  }

  for (const room of level.rooms) carve_room(level, room);

  // Cadeia principal: garante que todas as salas existam.
  for (let i = 1; i < level.rooms.length; i += 1) {
    const a = level.rooms[i - 1];
    const b = level.rooms[i];
    carve_corridor(level, [a.cx, a.cy], [b.cx, b.cy]);
  }

  // Corredores extras: criam lacos e libertam portas para trancar.
  for (let i = 0; i < 2; i += 1) {
    if (level.rooms.length < 3) break;
    const [a, b] = rng.sample(level.rooms, 2);
    if (Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy) > 26) continue;
    carve_corridor(level, [a.cx, a.cy], [b.cx, b.cy]);
  }

  if (level.rooms.length) {
    level.stairs_up = [level.rooms[0].cx, level.rooms[0].cy];
    level.stairs_down = [
      level.rooms[level.rooms.length - 1].cx,
      level.rooms[level.rooms.length - 1].cy,
    ];
  }

  // Cofre lateral com porta trancada (a partir do setor 2).
  let vault_door = null;
  let vault_rect = null;
  if (depth >= 2 && level.rooms.length) {
    const hosts = level.rooms.slice(1);
    const host = rng.choice(hosts.length ? hosts : level.rooms);
    [vault_door, vault_rect] = make_vault(level, rng, host);
  }

  place_doors(level, rng, depth >= 2);
  ensure_reachable(level, vault_door ? new Set([key(...vault_door)]) : new Set());

  place_loot(level, rng, depth, vault_rect);
  place_monsters(level, rng, depth);
  return level;
}
