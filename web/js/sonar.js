/**
 * Visao individual por jogador: revelacao, feixe do RULER e memoria.
 * Cada Player carrega sua propria memoria; nada e compartilhado.
 */

import { MEMORY_FADE_TURNS } from "./data.js";

export const UNKNOWN = 0;
export const REMEMBERED = 1;
export const VISIBLE = 2;

/** Cria a memoria zerada de um setor. */
export function create_memory(level) {
  return {
    w: level.w,
    h: level.h,
    known: Array.from({ length: level.h }, () => new Array(level.w).fill(0)),
    lit_at: Array.from({ length: level.h }, () => new Array(level.w).fill(-1)),
    dirty: [],
  };
}

function mark(memory, x, y, state, turn) {
  memory.known[y][x] = state;
  if (turn !== undefined) memory.lit_at[y][x] = turn;
  memory.dirty.push([x, y, state, turn === undefined ? -1 : turn]);
}

/** Revela um circulo de tiles em volta de (cx, cy). */
export function reveal_circle(memory, cx, cy, radius, turn) {
  if (!memory) return;
  const r2 = radius * radius;
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(memory.h - 1, cy + radius);
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(memory.w - 1, cx + radius);
  for (let y = y0; y <= y1; y += 1) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= r2) mark(memory, x, y, VISIBLE, turn);
    }
  }
}

/** Feixe reto do RULER. Retorna { distance, cells }. */
export function reveal_ray(memory, level, cx, cy, dx, dy, max_len, turn) {
  let x = cx;
  let y = cy;
  const cells = [];
  let distance = 0;
  while (distance < max_len) {
    const nx = x + dx;
    const ny = y + dy;
    if (!level.in_bounds(nx, ny)) break;
    const tile = level.tiles[ny][nx];
    if (tile.is_wall()) {
      if (memory.known[ny][nx] === UNKNOWN) mark(memory, nx, ny, REMEMBERED, turn);
      break;
    }
    x = nx;
    y = ny;
    distance += 1;
    cells.push([x, y]);
    mark(memory, x, y, VISIBLE, turn);
  }
  return { distance, cells };
}

/** Revela o layout inteiro como memoria (ROM DIAGNOSTIC). */
export function reveal_all(memory, turn) {
  if (!memory) return;
  for (let y = 0; y < memory.h; y += 1) {
    for (let x = 0; x < memory.w; x += 1) {
      mark(memory, x, y, REMEMBERED, turn);
    }
  }
}

/** Tiles visiveis que envelhecem voltam a apenas lembrados. */
export function fade(memory, turn, persists) {
  if (!memory || persists) return;
  const cutoff = turn - MEMORY_FADE_TURNS;
  for (let y = 0; y < memory.h; y += 1) {
    for (let x = 0; x < memory.w; x += 1) {
      if (memory.known[y][x] === VISIBLE && memory.lit_at[y][x] < cutoff) {
        mark(memory, x, y, REMEMBERED, undefined);
      }
    }
  }
}

/** Consome e devolve as mudancas desde a ultima sincronizacao. */
export function take_delta(memory) {
  if (!memory) return [];
  const delta = memory.dirty;
  memory.dirty = [];
  return delta;
}

/** Keyframe compacto para um cliente que acabou de entrar. */
export function keyframe(memory) {
  if (!memory) return [];
  return memory.known.map((row) => row.join(""));
}

export function apply_keyframe(memory, rows) {
  if (!memory || !Array.isArray(rows)) return;
  for (let y = 0; y < memory.h && y < rows.length; y += 1) {
    const row = String(rows[y] || "");
    for (let x = 0; x < memory.w; x += 1) {
      memory.known[y][x] = Number(row[x] || 0);
    }
  }
  memory.dirty = [];
}

export function apply_delta(memory, delta) {
  if (!memory || !Array.isArray(delta)) return;
  for (const [x, y, state] of delta) {
    if (y >= 0 && y < memory.h && x >= 0 && x < memory.w) {
      memory.known[y][x] = state;
    }
  }
}
