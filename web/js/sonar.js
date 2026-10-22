/** Visao: revelacao por sonar, feixe do RULER e desvanecimento da memoria. */

import { MEMORY_FADE_TURNS } from "./data.js";

export const UNKNOWN = 0;
export const REMEMBERED = 1;
export const VISIBLE = 2;

/** Revela um circulo de tiles em volta de (cx, cy). */
export function reveal_circle(level, cx, cy, radius, turn) {
  const r2 = radius * radius;
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(level.h - 1, cy + radius);
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(level.w - 1, cx + radius);
  for (let y = y0; y <= y1; y += 1) {
    const row_known = level.known[y];
    const row_lit = level.lit_at[y];
    const dy = y - cy;
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= r2) {
        row_known[x] = VISIBLE;
        row_lit[x] = turn;
      }
    }
  }
}

/** Feixe reto do RULER. Retorna { distance, cells }. */
export function reveal_ray(level, cx, cy, dx, dy, max_len, turn) {
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
      if (level.known[ny][nx] === UNKNOWN) level.known[ny][nx] = REMEMBERED;
      break;
    }
    x = nx;
    y = ny;
    distance += 1;
    cells.push([x, y]);
    level.known[y][x] = VISIBLE;
    level.lit_at[y][x] = turn;
  }
  return { distance, cells };
}

/** Revela o layout inteiro como memoria (usado pelo ROM DIAGNOSTIC). */
export function reveal_all(level, turn) {
  for (let y = 0; y < level.h; y += 1) {
    const row_known = level.known[y];
    const row_lit = level.lit_at[y];
    for (let x = 0; x < level.w; x += 1) {
      row_known[x] = REMEMBERED;
      row_lit[x] = turn;
    }
  }
}

/** Tiles visiveis que envelhecem voltam a apenas lembrados. */
export function fade(level, turn, persists) {
  if (persists) return;
  const cutoff = turn - MEMORY_FADE_TURNS;
  for (let y = 0; y < level.h; y += 1) {
    const row_known = level.known[y];
    const row_lit = level.lit_at[y];
    for (let x = 0; x < level.w; x += 1) {
      if (row_known[x] === VISIBLE && row_lit[x] < cutoff) {
        row_known[x] = REMEMBERED;
      }
    }
  }
}
