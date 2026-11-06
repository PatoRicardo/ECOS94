/**
 * Inteligencia dos monstros.
 *
 * Em party cada monstro escolhe um alvo entre os operadores vivos:
 * adjacente > cacador > ruido > visao. Novos comportamentos: ranged,
 * charger, summoner, sentinel, phantom e splitter.
 */

import { DOOR_CLOSED, DOOR_OPEN, NOISE } from "./data.js";
import { Monster } from "./entities.js";
import { C } from "./theme.js";
import * as status from "./status.js";

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

const BFS_LIMIT = 1500;
const key = (x, y) => `${x},${y}`;

/** Proximo passo do caminho mais curto de start ate goal. */
export function bfs_step(level, start, goal, limit = BFS_LIMIT, ghost = false) {
  if (start[0] === goal[0] && start[1] === goal[1]) return null;
  const startKey = key(...start);
  const goalKey = key(...goal);
  const prev = new Map([[startKey, null]]);
  const queue = [start];
  let head = 0;
  let explored = 0;
  let found = false;

  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    explored += 1;
    if (explored > limit) return null;
    const [cx, cy] = current;
    if (cx === goal[0] && cy === goal[1]) {
      found = true;
      break;
    }
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nk = key(nx, ny);
      if (prev.has(nk)) continue;
      if (!level.in_bounds(nx, ny)) continue;
      if (!ghost && level.tiles[ny][nx].is_wall()) continue;
      prev.set(nk, key(cx, cy));
      queue.push([nx, ny]);
    }
  }
  if (!found) return null;

  let node = goalKey;
  while (prev.get(node) !== null && prev.get(node) !== startKey) {
    node = prev.get(node);
  }
  return node.split(",").map(Number);
}

/** Executa um turno de todos os monstros. Retorna mensagens [texto, cor]. */
export function run_monsters(game) {
  const messages = [];
  for (const monster of [...game.level.monsters]) {
    if (!monster.alive) continue;
    if (monster.stun > 0) {
      monster.stun -= 1;
      continue;
    }
    const speed = Math.max(1, monster.speed - game.alert);
    monster.cooldown -= 1;
    if (monster.cooldown > 0) continue;
    monster.cooldown = speed;
    messages.push(...act(game, monster));
  }
  return messages;
}

function alive_players(game) {
  return game.players.filter((player) => !player.dead);
}

function choose_target(game, monster) {
  const players = alive_players(game);
  if (!players.length) return null;
  const adjacent = players.filter((player) =>
    monster.is_adjacent(player.x, player.y)
  );
  if (adjacent.length) {
    return adjacent.sort((a, b) => a.hp - b.hp || a.id - b.id)[0];
  }
  if (monster.behavior === "hunter") {
    return players.sort(
      (a, b) =>
        monster.distance_to(a.x, a.y) - monster.distance_to(b.x, b.y) ||
        a.id - b.id
    )[0];
  }
  const loud = [...players].sort((a, b) => b.noise - a.noise)[0];
  const threshold = monster.data.hearing || 0;
  if (threshold && loud && loud.noise >= threshold && game.noise_sources.has(loud.id)) {
    if (monster.distance_to(loud.x, loud.y) <= 14) return loud;
  }
  const in_sight = players
    .filter(
      (player) =>
        monster.distance_to(player.x, player.y) <= (monster.data.sight || 0)
    )
    .sort(
      (a, b) =>
        monster.distance_to(a.x, a.y) - monster.distance_to(b.x, b.y) ||
        a.id - b.id
    );
  return in_sight[0] || null;
}

function line_of_sight(level, a, b) {
  let [x, y] = a;
  const [bx, by] = b;
  const dx = Math.sign(bx - x);
  const dy = Math.sign(by - y);
  let guard = 0;
  while ((x !== bx || y !== by) && guard < 40) {
    guard += 1;
    x += dx;
    y += dy;
    if (!level.in_bounds(x, y)) return false;
    if (level.tiles[y][x].is_wall()) return false;
    if (x === bx && y === by) return true;
    if (dx === 0 || dy === 0) continue;
    // Linha diagonal: exige que ao menos um dos ortogonais seja livre.
    if (
      level.tiles[y][x - dx]?.is_wall() &&
      level.tiles[y - dy]?.[x]?.is_wall()
    ) {
      return false;
    }
  }
  return true;
}

function act(game, monster) {
  const messages = [];
  const level = game.level;
  const target = choose_target(game, monster);
  if (!target) {
    wander(game, monster);
    return messages;
  }

  if (monster.is_adjacent(target.x, target.y)) {
    attack_player(game, monster, target, messages);
    return messages;
  }

  if (
    (monster.behavior === "ranged" ||
      monster.behavior === "sentinel" ||
      monster.behavior === "summoner") &&
    monster.range &&
    monster.distance_to(target.x, target.y) <= monster.range &&
    line_of_sight(level, [monster.x, monster.y], [target.x, target.y])
  ) {
    if (monster.behavior === "summoner" && monster.summoned < 4) {
      summon_rat(game, monster, messages);
      return messages;
    }
    attack_player(game, monster, target, messages, true);
    return messages;
  }

  if (monster.behavior === "sentinel") return messages;

  if (monster.behavior === "charger") {
    const dx = target.x - monster.x;
    const dy = target.y - monster.y;
    if ((dx === 0 || dy === 0) && Math.abs(dx) + Math.abs(dy) <= 4) {
      const step = [Math.sign(dx), Math.sign(dy)];
      const first = [monster.x + step[0], monster.y + step[1]];
      const second = [monster.x + step[0] * 2, monster.y + step[1] * 2];
      if (level.is_passable(...first) && !game._player_at(...first)) {
        if (level.is_passable(...second) && !game._player_at(...second)) {
          [monster.x, monster.y] = second;
        } else {
          [monster.x, monster.y] = first;
        }
        messages.push([`${monster.name} CHARGES.`, C.LRED]);
        return messages;
      }
    }
  }

  const ghost = monster.behavior === "phantom";
  let step = bfs_step(level, [monster.x, monster.y], [target.x, target.y], BFS_LIMIT, ghost);
  if (step === null) {
    wander(game, monster);
    return messages;
  }

  if (monster.behavior === "erratic" && game.rng.chance(0.5)) {
    const dx = step[0] - monster.x;
    const dy = step[1] - monster.y;
    const lateral = game.rng.choice([
      [-dy, dx],
      [dy, -dx],
    ]);
    const candidate = [monster.x + lateral[0], monster.y + lateral[1]];
    if (level.in_bounds(...candidate) && level.is_passable(...candidate)) {
      step = candidate;
    }
  }

  step_to(game, monster, step, messages);
  return messages;
}

function summon_rat(game, monster, messages) {
  const child = new Monster("rat", game.depth, game.rng);
  const spot = game.level.free_spot_near([monster.x, monster.y]);
  if (!spot) return;
  [child.x, child.y] = spot;
  child.alive = true;
  game.level.monsters.push(child);
  monster.summoned += 1;
  messages.push([`${monster.name} SUMMONS A RAT.`, C.LMAGENTA]);
}

function step_to(game, monster, pos, messages) {
  const level = game.level;
  const [x, y] = pos;
  const tile = level.tiles[y]?.[x];
  if (!tile) return;
  if (tile.is_door() && tile.blocks()) {
    if (tile.door === DOOR_CLOSED) {
      tile.door = DOOR_OPEN;
      messages.push([`${monster.name} OPENS THE DOOR.`, C.WHITE]);
      return;
    }
    tile.brute += 1;
    game.add_noise(NOISE.unlock, [monster.x, monster.y], game.player);
    messages.push([`${monster.name} BREAKS THE DOOR (${tile.brute}/2).`, C.LRED]);
    if (tile.brute >= 2) {
      tile.door = DOOR_OPEN;
      tile.brute = 0;
    }
    return;
  }
  if (level.is_wall(x, y) && monster.behavior !== "phantom") return;
  if (game._player_at(x, y)) return;
  monster.x = x;
  monster.y = y;
}

function wander(game, monster) {
  const level = game.level;
  const options = DIRS8.map(([dx, dy]) => [monster.x + dx, monster.y + dy]);
  game.rng.shuffle(options);
  for (const [x, y] of options) {
    if (
      level.in_bounds(x, y) &&
      level.is_passable(x, y) &&
      !game._player_at(x, y)
    ) {
      monster.x = x;
      monster.y = y;
      return;
    }
  }
}

function attack_player(game, monster, player, messages, ranged = false) {
  const damage = status.damage_to_player(player, monster, game.rng);
  player.hp -= damage;
  game.last_hit_by = monster.name;
  player.last_hit_by = monster.name;
  game.add_noise(NOISE.combat, [player.x, player.y], player);
  const prefix = game.players.length > 1 ? `${player.name}: ` : "";
  messages.push([
    `${prefix}${monster.name} ${ranged ? "SHOOTS" : "HITS"} YOU FOR ${damage}.`,
    C.LRED,
  ]);

  if (
    monster.behavior === "wraith" &&
    player.inventory.length &&
    game.rng.chance(0.25)
  ) {
    const stolen = game.rng.choice(player.inventory);
    const index = player.inventory.indexOf(stolen);
    if (index >= 0) {
      player.inventory.splice(index, 1);
      messages.push([`${monster.name} DRAINS THE ${stolen.name} FROM ${player.name}.`, C.LRED]);
    }
  }
  if (player.hp <= 0) game._kill(player, monster.name);
}
