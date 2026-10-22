"""Entidades do jogo: jogador, monstros, itens e ROMs."""

from __future__ import annotations

from . import data
from .data import ITEMS, MONSTERS, ROMS, ROM_SLOTS


class Item:
    """Item no chao ou no inventario."""

    __slots__ = ("kind", "data", "kg", "charges", "payload", "x", "y")

    def __init__(self, kind: str, charges: int = 1, payload=None) -> None:
        self.kind = kind
        self.data = ITEMS[kind]
        self.kg = self.data["kg"]
        self.charges = charges
        self.payload = payload
        self.x = -1
        self.y = -1

    @property
    def name(self) -> str:
        return self.data["name"]

    @property
    def category(self) -> str:
        """Categoria do item: weapon | armor | consumable | tool | slate."""
        return self.data["kind"]

    @property
    def glyph(self) -> str:
        return self.data["glyph"]

    @property
    def color(self) -> int:
        return self.data["color"]


class Rom:
    """Fragmento de memoria somente-leitura. Upgrade permanente."""

    __slots__ = ("data", "kg", "x", "y")

    def __init__(self, rom_id: str) -> None:
        self.data = next(r for r in ROMS if r["id"] == rom_id)
        self.kg = self.data["kg"]
        self.x = -1
        self.y = -1

    @property
    def name(self) -> str:
        return self.data["name"]

    @property
    def id(self) -> str:
        return self.data["id"]

    @property
    def desc(self) -> str:
        return self.data["desc"]


class Monster:
    """Criatura do subsolo."""

    __slots__ = (
        "kind",
        "data",
        "name",
        "glyph",
        "color",
        "max_hp",
        "hp",
        "atk",
        "dfn",
        "speed",
        "x",
        "y",
        "alive",
        "stun",
        "cooldown",
        "behavior",
    )

    def __init__(self, kind: str, depth: int, rng) -> None:
        d = MONSTERS[kind]
        self.kind = kind
        self.data = d
        self.name = d["name"]
        self.glyph = d["glyph"]
        self.color = d["color"]
        self.max_hp = d["hp"] + depth // 3
        self.hp = self.max_hp
        self.atk = d["atk"] + depth // 4
        self.dfn = d["dfn"]
        # A velocidade cai devagar: no fim do jogo o primeiro golpe vem
        # antes, mas nada vira "acao a cada turno" no meio da descida.
        if d.get("boss"):
            self.speed = d["speed"]
        else:
            self.speed = max(1, d["speed"] - depth // 12)
        self.x = -1
        self.y = -1
        self.alive = True
        self.stun = 0
        self.behavior = d["behavior"]
        self.cooldown = rng.randint(0, self.speed)

    def is_adjacent(self, x: int, y: int) -> bool:
        return abs(self.x - x) <= 1 and abs(self.y - y) <= 1 and (
            self.x != x or self.y != y
        )

    def distance_to(self, x: int, y: int) -> int:
        return max(abs(self.x - x), abs(self.y - y))


class Player:
    """O operador, descendo o sistema."""

    def __init__(self) -> None:
        self.max_hp = 28
        self.hp = 28
        self.base_atk = 2
        self.base_dfn = 0
        self.x = 0
        self.y = 0
        self.depth = 1
        self.inventory: list[Item] = []
        self.equipped: dict[str, Item | None] = {"weapon": None, "armor": None}
        self.roms: list[Rom] = []
        self.noise = 0
        self.alert = 0
        self.turns = 0
        self.kills = 0
        self.peak_noise = 0
        self.resets = 0
        self.sonar_cooldown = 0
        self.rom_slot_used = False
        # modificadores vindos de ROMs
        self.bonus_sonar = 0
        self.bonus_capacity = 0
        self.ping_noise_mult = 1.0
        self.memory_persists = False
        self.diagnostic = False
        self.parity = 0
        self.overclock = False
        self.cache_radius = 0
        self.kernel = False
        self.watchdog = 1.0

    # ------------------------------------------------------------- derivados
    @property
    def atk(self) -> int:
        weapon = self.equipped.get("weapon")
        bonus = weapon.data.get("atk", 0) if weapon else 0
        return self.base_atk + bonus + self.parity

    @property
    def dfn(self) -> int:
        armor = self.equipped.get("armor")
        bonus = armor.data.get("dfn", 0) if armor else 0
        return self.base_dfn + bonus

    @property
    def capacity(self) -> int:
        return data.BASE_CAPACITY + self.bonus_capacity

    @property
    def load(self) -> int:
        total = sum(i.kg for i in self.inventory)
        for item in self.equipped.values():
            if item is not None:
                total += item.kg
        total += sum(r.kg for r in self.roms)
        return total

    @property
    def load_ratio(self) -> float:
        cap = self.capacity
        return self.load / cap if cap else 0.0

    @property
    def load_tier(self) -> str:
        ratio = self.load_ratio
        if ratio <= 0.50:
            return "light"
        if ratio <= 0.75:
            return "normal"
        if ratio <= 0.85:
            return "heavy"
        return "overload"

    @property
    def has_ruler(self) -> bool:
        return any(i.kind == "ruler" for i in self.inventory)

    @property
    def slates(self) -> list[Item]:
        return [i for i in self.inventory if i.kind == "slate"]

    @property
    def passwords(self) -> list[str]:
        return [i.payload for i in self.inventory if i.kind == "slate" and i.payload]

    @property
    def free_rom_slots(self) -> int:
        return ROM_SLOTS - len(self.roms)

    def alive(self) -> bool:
        return self.hp > 0
