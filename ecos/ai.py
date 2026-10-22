"""Inteligencia dos monstros.

Cada monstro reage a tres sinais:
  - proximidade do jogador (visao)
  - ruido global acima do limiar auditivo (perseguicao pela ultima fonte)
  - comportamento proprio (BAT e erratico, WRAITH drena, DEVOURER caça sempre)
"""

from __future__ import annotations

from collections import deque

from .data import DOOR_CLOSED, DOOR_OPEN, NOISE
from .render import LRED, WHITE

DIRS8 = ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (1, -1), (-1, 1), (1, 1))

_BFS_LIMIT = 1500


def bfs_step(level, start, goal, limit: int = _BFS_LIMIT):
    """Proximo passo do caminho mais curto de start ate goal."""
    if start == goal:
        return None
    prev: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
    queue = deque([start])
    explored = 0
    found = False
    while queue:
        current = queue.popleft()
        explored += 1
        if explored > limit:
            return None
        if current == goal:
            found = True
            break
        cx, cy = current
        for dx, dy in DIRS8:
            nxt = (cx + dx, cy + dy)
            if nxt in prev:
                continue
            nx, ny = nxt
            if not level.in_bounds(nx, ny):
                continue
            if level.tiles[ny][nx].is_wall():
                continue
            prev[nxt] = current
            queue.append(nxt)
    if not found:
        return None
    node = goal
    while prev.get(node) is not None and prev[node] != start:
        node = prev[node]
    return node


def run_monsters(game) -> list[tuple[str, int]]:
    """Executa um turno de todos os monstros. Retorna mensagens."""
    messages: list[tuple[str, int]] = []
    player = game.player
    for monster in list(game.level.monsters):
        if not monster.alive:
            continue
        if monster.stun > 0:
            monster.stun -= 1
            continue
        speed = max(1, monster.speed - player.alert)
        monster.cooldown -= 1
        if monster.cooldown > 0:
            continue
        monster.cooldown = speed
        messages.extend(_act(game, monster))
    return messages


def _act(game, monster) -> list[tuple[str, int]]:
    messages: list[tuple[str, int]] = []
    player = game.player
    level = game.level

    if monster.is_adjacent(player.x, player.y):
        _attack_player(game, monster, messages)
        return messages

    target = _target_for(game, monster)
    if target is None:
        _wander(game, monster)
        return messages

    step = bfs_step(level, (monster.x, monster.y), target)
    if step is None:
        _wander(game, monster)
        return messages

    if monster.behavior == "erratic" and game.rng.chance(0.5):
        dx = step[0] - monster.x
        dy = step[1] - monster.y
        lateral = game.rng.choice(((-dy, dx), (dy, -dx)))
        candidate = (monster.x + lateral[0], monster.y + lateral[1])
        if level.in_bounds(*candidate) and level.is_passable(*candidate):
            step = candidate

    _step_to(game, monster, step, messages)
    return messages


def _target_for(game, monster):
    """Define onde o monstro quer estar."""
    player = game.player
    if monster.behavior == "hunter":
        return (player.x, player.y)
    if player.noise >= 80:
        return (player.x, player.y)
    threshold = monster.data.get("hearing", 0)
    if threshold and player.noise >= threshold and game.noise_source:
        return game.noise_source
    if monster.distance_to(player.x, player.y) <= monster.data.get("sight", 0):
        return (player.x, player.y)
    return None


def _step_to(game, monster, pos, messages) -> None:
    level = game.level
    x, y = pos
    tile = level.tiles[y][x]
    if tile.is_door() and tile.blocks():
        if tile.door == DOOR_CLOSED:
            tile.door = DOOR_OPEN
            messages.append((f"{monster.name} OPENS THE DOOR.", WHITE))
            return
        tile.brute += 1
        game.add_noise(NOISE["unlock"], (monster.x, monster.y))
        messages.append(
            (f"{monster.name} BREAKS THE DOOR ({tile.brute}/2).", LRED)
        )
        if tile.brute >= 2:
            tile.door = DOOR_OPEN
            tile.brute = 0
        return
    monster.x, monster.y = x, y


def _wander(game, monster) -> None:
    level = game.level
    options = [(monster.x + dx, monster.y + dy) for dx, dy in DIRS8]
    game.rng.shuffle(options)
    for x, y in options:
        if level.in_bounds(x, y) and level.is_passable(x, y):
            monster.x, monster.y = x, y
            return


def _attack_player(game, monster, messages) -> None:
    from . import status

    player = game.player
    damage = status.damage_to_player(player, monster, game.rng)
    player.hp -= damage
    game.last_hit_by = monster.name
    game.add_noise(NOISE["combat"], (player.x, player.y))
    messages.append((f"{monster.name} HITS YOU FOR {damage}.", LRED))
    if (
        monster.behavior == "wraith"
        and player.inventory
        and game.rng.chance(0.25)
    ):
        stolen = game.rng.choice(player.inventory)
        if stolen in player.inventory:
            player.inventory.remove(stolen)
            messages.append(
                (f"{monster.name} DRAINS THE {stolen.name} FROM YOU.", LRED)
            )
    if player.hp <= 0:
        messages.append(("YOU DIE IN THE DARK.", LRED))
