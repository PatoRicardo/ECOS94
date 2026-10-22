"""Medidor de combate 1x1 e de situacao de morte do bot.

Nao faz parte do jogo: serve para calibrar os numeros de balanceamento.
Uso:
    python tools/duel.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ecos import audio  # noqa: E402
from ecos.data import MONSTERS  # noqa: E402
from ecos.entities import Monster, Player  # noqa: E402
from ecos.rng import Rng  # noqa: E402
from ecos.status import damage_to_monster, damage_to_player  # noqa: E402

audio.MUTED = True

WEAPONS = [("nenhuma", 0), ("faca", 1), ("cleaver", 3)]
ARMORS = [("nenhuma", 0), ("placa", 1)]


def duel(monster_kind: str, depth: int, weapon: int, armor: int, rng) -> tuple[bool, int]:
    """Simula um combate 1x1 ate um dos dois morrer. Devolve (venceu, turnos)."""
    player = Player()
    player.hp = player.max_hp
    player.base_atk = 2 + weapon
    player.base_dfn = armor
    monster = Monster(monster_kind, depth, rng)
    turns = 0
    while player.hp > 0 and monster.hp > 0 and turns < 200:
        turns += 1
        dmg, _ = damage_to_monster(player, monster, rng)
        monster.hp -= dmg
        if monster.hp <= 0:
            return True, turns
        if monster.speed <= 1 or turns % monster.speed == 0:
            player.hp -= damage_to_player(player, monster, rng)
    return False, turns


def table() -> None:
    print("== Taxa de vitoria em duelo 1x1 (jogador com faca, sem armadura) ==")
    print(f"{'prof':>5} {'monstro':<12} {'hp':>3} {'atk':>4} {'dfn':>4} {'vitoria':>9} {'turnos':>7}")
    for depth in (1, 3, 5, 7, 9, 10):
        for kind in ("rat", "goblin", "bat", "wraith", "rat_giant"):
            wins = 0
            total_turns = 0
            rng = Rng(4242 + depth)
            runs = 400
            for _ in range(runs):
                won, turns = duel(kind, depth, 1, 0, rng)
                wins += won
                total_turns += turns
            d = MONSTERS[kind]
            hp = d["hp"] + depth // 3
            atk = d["atk"] + depth // 4
            print(
                f"{depth:>5} {kind:<12} {hp:>3} {atk:>4} {d['dfn']:>4} "
                f"{wins * 100 // runs:>8}% {total_turns // runs:>7}"
            )
        print()


def table_armor() -> None:
    print("== Duelo 1x1 com placa (dfn +1) ==")
    for depth in (3, 5, 7):
        for kind in ("wraith", "rat_giant"):
            wins = 0
            rng = Rng(99 + depth)
            runs = 400
            for _ in range(runs):
                won, _ = duel(kind, depth, 1, 1, rng)
                wins += won
            print(f"  prof {depth} {kind:<12} {wins * 100 // runs:>3}%")
    print()


def boss() -> None:
    print("== Chefe: DEVOURER no setor 10 ==")
    for label, weapon, armor, parity in (
        ("faca", 1, 0, 0),
        ("faca+placa", 1, 1, 0),
        ("cleaver+placa", 3, 1, 0),
        ("cleaver+placa+PARITY", 3, 1, 2),
    ):
        wins = 0
        turns_total = 0
        hp_left = 0
        rng = Rng(777)
        runs = 400
        for _ in range(runs):
            player = Player()
            player.hp = player.max_hp
            player.base_atk = 2 + weapon
            player.base_dfn = armor
            player.parity = parity
            monster = Monster("devourer", 10, rng)
            turns = 0
            while player.hp > 0 and monster.hp > 0 and turns < 200:
                turns += 1
                dmg, _ = damage_to_monster(player, monster, rng)
                monster.hp -= dmg
                if monster.hp <= 0:
                    break
                if monster.speed <= 1 or turns % monster.speed == 0:
                    player.hp -= damage_to_player(player, monster, rng)
            if monster.hp <= 0:
                wins += 1
                hp_left += player.hp
                turns_total += turns
        print(
            f"  {label:<24} vitoria {wins * 100 // runs:>3}%  "
            f"turnos {turns_total // max(wins,1):>3}  hp restante {hp_left // max(wins,1):>3}"
        )


if __name__ == "__main__":
    table()
    table_armor()
    boss()
