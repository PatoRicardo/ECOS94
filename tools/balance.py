"""Grade de balanceamento: roda o bot com varias combinacoes de numeros.

Nao faz parte do jogo. Uso:
    python tools/balance.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ecos import audio, data, dungeon, entities  # noqa: E402
from tools.simulate import play_bot  # noqa: E402

audio.MUTED = True

SEEDS = list(range(7000, 7012))
BASE_TABLE = dungeon._item_table
BASE_INIT = entities.Player.__init__
BASE_PLACE = dungeon._place_monsters


def patch(hp: int, heal: int, plate_w: int, sight: int, wraith_atk: int, mobs=None) -> None:
    def init(self) -> None:
        BASE_INIT(self)
        self.max_hp = hp
        self.hp = hp

    entities.Player.__init__ = init
    data.ITEMS["ampola"]["heal"] = heal
    data.MONSTERS["wraith"]["sight"] = sight
    data.MONSTERS["wraith"]["atk"] = wraith_atk

    def table(depth: int):
        items = BASE_TABLE(depth)
        return [
            (name, plate_w if name == "plate" else weight) for name, weight in items
        ]

    dungeon._item_table = table

    if mobs is not None:
        def place(level, rng, depth: int) -> None:
            base, spread = mobs(depth)
            count = base + rng.randint(0, spread)
            from ecos.entities import Monster

            if len(level.rooms) < 2:
                return
            pool = level.rooms[1:]
            spawn = data.SPAWN_TABLE.get(min(depth, 10), data.SPAWN_TABLE[10])
            for _ in range(count):
                room = rng.choice(pool)
                spot = room.free_floor(level, rng)
                if spot is None:
                    continue
                monster = Monster(rng.choice(spawn), depth, rng)
                monster.x, monster.y = spot
                level.monsters.append(monster)
            if depth == 10:
                boss = Monster("devourer", depth, rng)
                boss.x, boss.y = level.rooms[-1].cx, level.rooms[-1].cy
                level.monsters.append(boss)

        dungeon._place_monsters = place


def run() -> tuple[int, float, list]:
    from ecos.actions import Game

    wins = 0
    depths = []
    for seed in SEEDS:
        game = Game(seed)
        won, depth = play_bot(game, max_turns=12000)
        wins += won
        depths.append(depth)
    return wins, sum(depths) / len(depths), depths


if __name__ == "__main__":
    combos = [
        # hp, heal, plate_w, wraith_sight, wraith_atk, mobs
        (18, 8, 14, 10, 3, None),
        (18, 8, 14, 10, 3, lambda d: (1 + d // 2, 2)),
        (18, 8, 14, 10, 3, lambda d: (2 + d // 3, 1)),
        (18, 8, 14, 10, 3, lambda d: (1 + d // 3, 1)),
        (22, 10, 16, 10, 3, lambda d: (1 + d // 2, 2)),
        (22, 10, 16, 10, 3, lambda d: (2 + d // 3, 1)),
        (22, 12, 18, 9, 3, lambda d: (2 + d // 3, 1)),
        (24, 12, 18, 9, 3, lambda d: (2 + d // 3, 1)),
    ]
    for combo in combos:
        patch(*combo)
        wins, avg, depths = run()
        mobs = "padrao" if combo[5] is None else f"{combo[5](1)}..{combo[5](9)}+2"
        print(
            f"hp={combo[0]:>3} heal={combo[1]:>3} plate={combo[2]:>3} "
            f"sight={combo[3]:>3} atk={combo[4]:>3} mobs={mobs:<12} -> "
            f"vitorias {wins:>2}/{len(SEEDS)} media {avg:.2f} {depths}"
        )
