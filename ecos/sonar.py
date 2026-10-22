"""Visao: revelacao por sonar, feixe do RULER e desvanecimento da memoria."""

from __future__ import annotations

from .data import MEMORY_FADE_TURNS

UNKNOWN = 0
REMEMBERED = 1
VISIBLE = 2


def reveal_circle(level, cx: int, cy: int, radius: int, turn: int) -> None:
    """Revela um circulo de tiles em volta de (cx, cy)."""
    r2 = radius * radius
    y0 = max(0, cy - radius)
    y1 = min(level.h - 1, cy + radius)
    x0 = max(0, cx - radius)
    x1 = min(level.w - 1, cx + radius)
    for y in range(y0, y1 + 1):
        row_known = level.known[y]
        row_lit = level.lit_at[y]
        dy = y - cy
        for x in range(x0, x1 + 1):
            dx = x - cx
            if dx * dx + dy * dy <= r2:
                row_known[x] = VISIBLE
                row_lit[x] = turn


def reveal_ray(level, cx: int, cy: int, dx: int, dy: int, max_len: int, turn: int):
    """Feixe reto do RULER. Retorna (distancia, celulas reveladas)."""
    x, y = cx, cy
    cells: list[tuple[int, int]] = []
    distance = 0
    while distance < max_len:
        nx, ny = x + dx, y + dy
        if not level.in_bounds(nx, ny):
            break
        tile = level.tiles[ny][nx]
        if tile.is_wall():
            if level.known[ny][nx] == UNKNOWN:
                level.known[ny][nx] = REMEMBERED
            break
        x, y = nx, ny
        distance += 1
        cells.append((x, y))
        level.known[y][x] = VISIBLE
        level.lit_at[y][x] = turn
    return distance, cells


def reveal_all(level, turn: int) -> None:
    """Revela o layout inteiro como memoria (usado pelo ROM DIAGNOSTIC)."""
    for y in range(level.h):
        row_known = level.known[y]
        row_lit = level.lit_at[y]
        for x in range(level.w):
            row_known[x] = REMEMBERED
            row_lit[x] = turn


def fade(level, turn: int, persists: bool) -> None:
    """Tiles visiveis que envelhecem voltam a apenas lembrados."""
    if persists:
        return
    cutoff = turn - MEMORY_FADE_TURNS
    for y in range(level.h):
        row_known = level.known[y]
        row_lit = level.lit_at[y]
        for x in range(level.w):
            if row_known[x] == VISIBLE and row_lit[x] < cutoff:
                row_known[x] = REMEMBERED
