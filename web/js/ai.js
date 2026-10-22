/**
 * Inteligencia dos monstros.
 *
 * Cada monstro reage a tres sinais:
 *   - proximidade do jogador (visao)
 *   - ruido global acima do limiar auditivo (perseguicao pela ultima fonte)
 *   - comportamento proprio (BAT e erratico, WRAITH drena, DEVOURER caca sempre)
 */

import { DOOR_CLOSED, DOOR_OPEN, NOISE } from "./data.js";
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
export function bfs_step(level, start, goal, limit = BFS_LIMIT) {
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
      if (level.tiles[ny][nx].is_wall()) continue;
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
    const speed = Math.max(1, monster.speed - game.player.alert);
    monster.cooldown -= 1;
    if (monster.cooldown > 0) continue;
    monster.cooldown = speed;
    messages.push(...act(game, monster));
  }
  return messages;
}

function act(game, monster) {
  const messages = [];
  const player = game.player;
  const level = game.level;

  if (monster.is_adjacent(player.x, player.y)) {
    attack_player(game, monster, messages);
    return messages;
  }

  const target = target_for(game, monster);
  if (target === null) {
    wander(game, monster);
    return messages;
  }

  let step = bfs_step(level, [monster.x, monster.y], target);
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
    if (level.in_bounds(candidate[0], candidate[1])) {
      if (level.is_passable(candidate[0], candidate[1])) step = candidate;
    }
  }

  step_to(game, monster, step, messages);
  return messages;
}

/** Define onde o monstro quer estar. */
function target_for(game, monster) {
  const player = game.player;
  if (monster.behavior === "hunter") return [player.x, player.y];
  if (player.noise >= 80) return [player.x, player.y];
  const threshold = monster.data.hearing || 0;
  if (threshold && player.noise >= threshold && game.noise_source) {
    return game.noise_source;
  }
  if (monster.distance_to(player.x, player.y) <= (monster.data.sight || 0)) {
    return [player.x, player.y];
  }
  return null;
}

function step_to(game, monster, pos, messages) {
  const level = game.level;
  const [x, y] = pos;
  const tile = level.tiles[y][x];
  if (tile.is_door() && tile.blocks()) {
    if (tile.door === DOOR_CLOSED) {
      tile.door = DOOR_OPEN;
      messages.push([`${monster.name} OPENS THE DOOR.`, C.WHITE]);
      return;
    }
    tile.brute += 1;
    game.add_noise(NOISE.unlock, [monster.x, monster.y]);
    messages.push([`${monster.name} BREAKS THE DOOR (${tile.brute}/2).`, C.LRED]);
    if (tile.brute >= 2) {
      tile.door = DOOR_OPEN;
      tile.brute = 0;
    }
    return;
  }
  monster.x = x;
  monster.y = y;
}

function wander(game, monster) {
  const level = game.level;
  const options = DIRS8.map(([dx, dy]) => [monster.x + dx, monster.y + dy]);
  game.rng.shuffle(options);
  for (const [x, y] of options) {
    if (level.in_bounds(x, y) && level.is_passable(x, y)) {
      monster.x = x;
      monster.y = y;
      return;
    }
  }
}

function attack_player(game, monster, messages) {
  const player = game.player;
  const damage = status.damage_to_player(player, monster, game.rng);
  player.hp -= damage;
  game.last_hit_by = monster.name;
  game.add_noise(NOISE.combat, [player.x, player.y]);
  messages.push([`${monster.name} HITS YOU FOR ${damage}.`, C.LRED]);

  if (monster.behavior === "wraith" && player.inventory.length && game.rng.chance(0.25)) {
    const stolen = game.rng.choice(player.inventory);
    const index = player.inventory.indexOf(stolen);
    if (index >= 0) {
      player.inventory.splice(index, 1);
      messages.push([`${monster.name} DRAINS THE ${stolen.name} FROM YOU.`, C.LRED]);
    }
  }
  if (player.hp <= 0) {
    messages.push(["YOU DIE IN THE DARK.", C.LRED]);
  }
}
