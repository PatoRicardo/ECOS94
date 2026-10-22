"""Geracao de setor: salas, corredores, portas, loot e monstros.

Garantias de geracao (verificadas por tools/simulate.py):
  - a escada de descida e sempre alcancavel sem destrancar nada
  - o SLATE (com a senha) fica sempre numa sala alcancavel
  - a porta trancada existe a partir do setor 2 e guarda algo
"""

from __future__ import annotations

from collections import deque

from . import data
from .data import (
    DOOR_CLOSED,
    DOOR_LOCKED,
    DOOR_OPEN,
    PASSWORD_WORDS,
    SPAWN_TABLE,
)
from .entities import Item, Monster, Rom

DIRS4 = ((0, -1), (0, 1), (-1, 0), (1, 0))


class Tile:
    __slots__ = ("kind", "door", "brute")

    def __init__(self, kind: str = "wall", door: str | None = None) -> None:
        self.kind = kind  # 'wall' | 'floor' | 'door'
        self.door = door  # None | 'open' | 'closed' | 'locked'
        self.brute = 0  # tentativas de forca bruta nesta porta

    def is_wall(self) -> bool:
        return self.kind == "wall"

    def blocks(self) -> bool:
        """Porta fechada ou trancada bloqueia o caminho."""
        if self.kind == "wall":
            return True
        if self.kind == "door":
            return self.door in (DOOR_CLOSED, DOOR_LOCKED)
        return False

    def is_door(self) -> bool:
        return self.kind == "door"


class Room:
    __slots__ = ("x", "y", "w", "h")

    def __init__(self, x: int, y: int, w: int, h: int) -> None:
        self.x = x
        self.y = y
        self.w = w
        self.h = h

    @property
    def cx(self) -> int:
        return self.x + self.w // 2

    @property
    def cy(self) -> int:
        return self.y + self.h // 2

    def intersects(self, other: "Room", pad: int = 1) -> bool:
        return not (
            self.x - pad > other.x + other.w - 1
            or other.x - pad > self.x + self.w - 1
            or self.y - pad > other.y + other.h - 1
            or other.y - pad > self.y + self.h - 1
        )

    def free_floor(self, level, rng, tries: int = 40):
        """Uma posicao de chao realmente livre (nao porta, sem monstro)."""
        for _ in range(tries):
            x = rng.randint(self.x, self.x + self.w - 1)
            y = rng.randint(self.y, self.y + self.h - 1)
            if not level.in_bounds(x, y):
                continue
            if level.tiles[y][x].kind != "floor":
                continue
            if level.monster_at(x, y) is not None:
                continue
            return x, y
        return None


class Level:
    def __init__(self, w: int, h: int) -> None:
        self.w = w
        self.h = h
        self.tiles = [[Tile("wall") for _ in range(w)] for _ in range(h)]
        self.rooms: list[Room] = []
        self.items: list[Item] = []
        self.roms_on_floor: list[Rom] = []
        self.monsters: list[Monster] = []
        self.stairs_up = (0, 0)
        self.stairs_down = (0, 0)
        self.password: str | None = None
        self.known = [[0] * w for _ in range(h)]
        self.lit_at = [[-1] * w for _ in range(h)]

    # ------------------------------------------------------------- consultas
    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.w and 0 <= y < self.h

    def tile(self, x: int, y: int) -> Tile | None:
        if not self.in_bounds(x, y):
            return None
        return self.tiles[y][x]

    def is_wall(self, x: int, y: int) -> bool:
        t = self.tile(x, y)
        return t is None or t.is_wall()

    def is_passable(self, x: int, y: int) -> bool:
        t = self.tile(x, y)
        if t is None:
            return False
        return not t.blocks()

    def monster_at(self, x: int, y: int) -> Monster | None:
        for m in self.monsters:
            if m.alive and m.x == x and m.y == y:
                return m
        return None

    def item_at(self, x: int, y: int) -> Item | None:
        for it in self.items:
            if it.x == x and it.y == y:
                return it
        return None

    def rom_at(self, x: int, y: int) -> Rom | None:
        for rom in self.roms_on_floor:
            if rom.x == x and rom.y == y:
                return rom
        return None

    def floor_positions(self):
        for y in range(self.h):
            for x in range(self.w):
                if self.tiles[y][x].kind == "floor":
                    yield x, y


# ------------------------------------------------------------------ helpers
def reachable_tiles(level, start, locked_open: bool = False) -> set[tuple[int, int]]:
    """Celulas alcancaveis a partir de start (4 direcoes).

    Portas trancadas bloqueiam, a menos que locked_open seja verdadeiro.
    """
    if not level.in_bounds(*start):
        return set()
    seen = {(start[0], start[1])}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in DIRS4:
            nxt = (x + dx, y + dy)
            if nxt in seen:
                continue
            if not level.in_bounds(*nxt):
                continue
            tile = level.tiles[nxt[1]][nxt[0]]
            if tile.kind == "wall":
                continue
            if (
                tile.is_door()
                and tile.door == DOOR_LOCKED
                and not locked_open
            ):
                continue
            seen.add(nxt)
            queue.append(nxt)
    return seen


def _carve_room(level: Level, room: Room) -> None:
    for y in range(room.y, room.y + room.h):
        for x in range(room.x, room.x + room.w):
            level.tiles[y][x] = Tile("floor")


def _carve_corridor(level: Level, a: tuple[int, int], b: tuple[int, int]) -> None:
    """Corredor em L: horizontal depois vertical."""
    ax, ay = a
    bx, by = b
    x, y = ax, ay
    while x != bx:
        x += 1 if bx > x else -1
        level.tiles[y][x] = Tile("floor")
    while y != by:
        y += 1 if by > y else -1
        level.tiles[y][x] = Tile("floor")


def _carve_line(level: Level, a: tuple[int, int], b: tuple[int, int]) -> None:
    """Corredor reto (horizontal ou vertical) entre dois pontos."""
    ax, ay = a
    bx, by = b
    step_x = 0 if ax == bx else (1 if bx > ax else -1)
    step_y = 0 if ay == by else (1 if by > ay else -1)
    x, y = ax, ay
    while True:
        level.tiles[y][x] = Tile("floor")
        if (x, y) == (bx, by):
            break
        x += step_x
        y += step_y


def _make_vault(level: Level, rng, host: Room):
    """Cria um cofre lateral: alcovao opcional com uma porta trancada.

    O cofre fica a tres tiles da sala hospedeira, entao trancar a porta dele
    nunca bloqueia o caminho principal do setor.

    Devolve ((porta_x, porta_y), retangulo_do_cofre) ou (None, None).
    """
    dirs = ((0, -1), (0, 1), (-1, 0), (1, 0))
    rng.shuffle(dirs)
    for dx, dy in dirs:
        if dx == 0:
            exit_x, exit_y = host.cx, (host.y - 1 if dy < 0 else host.y + host.h)
        else:
            exit_x, exit_y = (host.x - 1 if dx < 0 else host.x + host.w), host.cy

        front_x, front_y = exit_x + dx * 2, exit_y + dy * 2

        if dx == 0:
            rx0, rx1 = host.cx - 1, host.cx + 1
            ry0, ry1 = (
                (front_y - 2, front_y) if dy < 0 else (front_y, front_y + 2)
            )
        else:
            ry0, ry1 = host.cy - 1, host.cy + 1
            rx0, rx1 = (
                (front_x - 2, front_x) if dx < 0 else (front_x, front_x + 2)
            )

        if rx0 < 1 or ry0 < 1 or rx1 > level.w - 2 or ry1 > level.h - 2:
            continue
        if _area_taken(level, rx0, ry0, rx1, ry1, host):
            continue
        if _area_taken(level, min(exit_x, front_x), min(exit_y, front_y),
                       max(exit_x, front_x), max(exit_y, front_y), host):
            continue
        # O cofre precisa ser territorio virgem: parede em todos os tiles.
        # Sem isso a porta do cofre cairia em cima de um corredor principal.
        if any(
            not level.tiles[y][x].is_wall()
            for y in range(ry0, ry1 + 1)
            for x in range(rx0, rx1 + 1)
        ):
            continue

        _carve_line(level, (exit_x, exit_y), (front_x, front_y))
        for y in range(ry0, ry1 + 1):
            for x in range(rx0, rx1 + 1):
                level.tiles[y][x] = Tile("floor")
        # A porta fica na entrada do cofre: bloqueia so o cofre.
        level.tiles[front_y][front_x] = Tile("door", DOOR_LOCKED)
        return (front_x, front_y), (rx0, ry0, rx1, ry1)
    return None, None


def _area_taken(level: Level, x0: int, y0: int, x1: int, y1: int, ignore: Room) -> bool:
    """True se o retangulo sobrepoe alguma sala existente."""
    for room in level.rooms:
        if room is ignore:
            continue
        if not (
            x1 < room.x
            or room.x + room.w - 1 < x0
            or y1 < room.y
            or room.y + room.h - 1 < y0
        ):
            return True
    return False


def _door_candidates(level: Level) -> list[tuple[int, int]]:
    """Tiles internos de sala cujo vizinho externo e corredor."""
    candidates: list[tuple[int, int]] = []
    for room in level.rooms:
        for x in range(room.x, room.x + room.w):
            for y in (room.y - 1, room.y + room.h):
                if level.in_bounds(x, y) and not level.is_wall(x, y):
                    inner_y = room.y if y == room.y - 1 else room.y + room.h - 1
                    candidates.append((x, inner_y))
        for y in range(room.y, room.y + room.h):
            for x in (room.x - 1, room.x + room.w):
                if level.in_bounds(x, y) and not level.is_wall(x, y):
                    inner_x = room.x if x == room.x - 1 else room.x + room.w - 1
                    candidates.append((inner_x, y))
    return candidates


def _place_doors(level: Level, rng, want_locked: bool) -> None:
    candidates = _door_candidates(level)
    rng.shuffle(candidates)
    limit = 2 + rng.randint(0, 2)
    placed: list[tuple[int, int]] = []
    for x, y in candidates:
        if len(placed) >= limit:
            break
        tile = level.tiles[y][x]
        if tile.kind != "floor":
            continue
        tile.kind = "door"
        tile.door = DOOR_CLOSED
        placed.append((x, y))
    if not want_locked or not placed:
        return
    # Tranca a primeira porta que NAO impedir a chegada as escadas de descida.
    for x, y in placed:
        level.tiles[y][x].door = DOOR_LOCKED
        if level.stairs_down in reachable_tiles(level, level.stairs_up):
            return
        level.tiles[y][x].door = DOOR_CLOSED


def _ensure_reachable(level: Level, protected: set | None = None) -> None:
    """Destranca portas ate a escada de descida ficar alcancavel."""
    protected = protected or set()
    for _ in range(len(level.rooms) + 3):
        if level.stairs_down in reachable_tiles(level, level.stairs_up):
            return
        unlocked = False
        for y in range(level.h):
            for x in range(level.w):
                tile = level.tiles[y][x]
                if (x, y) in protected:
                    continue
                if tile.is_door() and tile.door == DOOR_LOCKED:
                    tile.door = DOOR_CLOSED
                    unlocked = True
                    break
            if unlocked:
                break


def _item_table(depth: int):
    table = [
        ("dagger", 26),
        ("ampola", 34),
        ("ruler", 16),
        ("plate", 14),
    ]
    if depth >= 3:
        table += [("cleaver", 16), ("damper", 18), ("shocker", 12)]
    else:
        table += [("damper", 8)]
    return table


def _place_loot(level: Level, rng, depth: int, vault_rect=None) -> None:
    if not level.rooms:
        return

    open_set = reachable_tiles(level, level.stairs_up)
    vault_set = reachable_tiles(level, level.stairs_up, locked_open=True)

    open_rooms = [r for r in level.rooms if (r.cx, r.cy) in open_set]
    vault_rooms = [
        r
        for r in level.rooms
        if (r.cx, r.cy) in vault_set and (r.cx, r.cy) not in open_set
    ]
    if not open_rooms:
        open_rooms = list(level.rooms)
    if not vault_rooms:
        vault_rooms = list(level.rooms)

    # Itens comuns: em qualquer sala, exceto a inicial.
    pool = [r for r in level.rooms if r is not level.rooms[0]] or list(level.rooms)
    count = 8 + depth + rng.randint(0, 2)
    for index in range(count):
        room = rng.choice(pool)
        spot = room.free_floor(level, rng)
        if spot is None:
            continue
        # Garante pelo menos uma arma logo nos primeiros setores.
        if index == 0 and depth <= 3:
            kind = "dagger" if depth < 3 else rng.choice(["dagger", "cleaver"])
        else:
            kind = rng.weighted(_item_table(depth))
        item = Item(kind)
        item.x, item.y = spot
        level.items.append(item)

    # SLATE: sempre numa sala alcancavel sem destrancar.
    level.password = rng.choice(PASSWORD_WORDS)
    slate_rooms = [r for r in open_rooms if r is not level.rooms[0]] or open_rooms
    for room in rng.sample(slate_rooms, len(slate_rooms)):
        spot = room.free_floor(level, rng)
        if spot is None:
            continue
        slate = Item("slate", payload=level.password)
        slate.x, slate.y = spot
        level.items.append(slate)
        break

    # ROM: preferencialmente dentro do cofre trancado.
    if 2 <= depth <= 7:
        spot = None
        if vault_rect is not None:
            rx0, ry0, rx1, ry1 = vault_rect
            spots = [
                (x, y)
                for y in range(ry0, ry1 + 1)
                for x in range(rx0, rx1 + 1)
                if level.tiles[y][x].kind == "floor"
            ]
            if spots:
                spot = rng.choice(spots)
        if spot is None:
            for room in rng.sample(vault_rooms, len(vault_rooms)):
                spot = room.free_floor(level, rng)
                if spot is not None:
                    break
        if spot is not None:
            rom = Rom(rng.choice(data.ROMS)["id"])
            rom.x, rom.y = spot
            level.roms_on_floor.append(rom)


def _place_monsters(level: Level, rng, depth: int) -> None:
    if len(level.rooms) < 2:
        return
    pool = level.rooms[1:]
    table = SPAWN_TABLE.get(min(depth, 10), SPAWN_TABLE[10])
    if depth >= 10:
        # Ultimo setor: arena do chefe, nao um formigueiro.
        count = 2 + rng.randint(0, 1)
    else:
        count = 2 + depth // 2 + rng.randint(0, 2)
    for _ in range(count):
        room = rng.choice(pool)
        spot = room.free_floor(level, rng)
        if spot is None:
            continue
        monster = Monster(rng.choice(table), depth, rng)
        monster.x, monster.y = spot
        level.monsters.append(monster)
    if depth == 10:
        boss = Monster("devourer", depth, rng)
        boss.x, boss.y = level.rooms[-1].cx, level.rooms[-1].cy
        level.monsters.append(boss)


def generate(rng, depth: int) -> Level:
    """Cria um setor completo para a profundidade informada."""
    w = rng.randint(46, 72)
    h = rng.randint(30, 48)
    level = Level(w, h)

    target_rooms = min(9, 4 + depth // 2)
    for _ in range(400):
        if len(level.rooms) >= target_rooms:
            break
        rw = rng.randint(5, 11)
        rh = rng.randint(4, 8)
        rx = rng.randint(1, w - rw - 2)
        ry = rng.randint(1, h - rh - 2)
        room = Room(rx, ry, rw, rh)
        if any(room.intersects(other, pad=1) for other in level.rooms):
            continue
        level.rooms.append(room)

    for room in level.rooms:
        _carve_room(level, room)

    # Cadeia principal: garante que todas as salas existam.
    for i in range(1, len(level.rooms)):
        a = level.rooms[i - 1]
        b = level.rooms[i]
        _carve_corridor(level, (a.cx, a.cy), (b.cx, b.cy))

    # Corredores extras: criam lacos e libertam portas para trancar.
    for _ in range(2):
        if len(level.rooms) < 3:
            break
        a, b = rng.sample(level.rooms, 2)
        if abs(a.cx - b.cx) + abs(a.cy - b.cy) > 26:
            continue
        _carve_corridor(level, (a.cx, a.cy), (b.cx, b.cy))

    if level.rooms:
        level.stairs_up = (level.rooms[0].cx, level.rooms[0].cy)
        level.stairs_down = (level.rooms[-1].cx, level.rooms[-1].cy)

    # Cofre lateral com porta trancada (a partir do setor 2).
    vault_door = None
    vault_rect = None
    if depth >= 2 and level.rooms:
        host = rng.choice(level.rooms[1:] or level.rooms)
        vault_door, vault_rect = _make_vault(level, rng, host)

    _place_doors(level, rng, want_locked=depth >= 2)
    _ensure_reachable(level, protected={vault_door} if vault_door else set())

    _place_loot(level, rng, depth, vault_rect)
    _place_monsters(level, rng, depth)
    return level
