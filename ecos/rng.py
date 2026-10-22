"""Gerador de numeros aleatorios semeado.

Toda a aleatoriedade do jogo passa por aqui, para que uma seed reproduza
exatamente a mesma run: mesmo mapa, mesmo loot, mesmo comportamento de IA.
"""

from __future__ import annotations

import random
import zlib


class Rng:
    """Envoltório determinístico sobre random.Random."""

    def __init__(self, seed: int) -> None:
        self.seed = int(seed) & 0xFFFFFFFF
        self._r = random.Random(self.seed)
        self._fork_count = 0

    # ---------------------------------------------------------------- basico
    def random(self) -> float:
        return self._r.random()

    def randint(self, a: int, b: int) -> int:
        return self._r.randint(a, b)

    def choice(self, seq):
        return self._r.choice(seq)

    def shuffle(self, seq):
        """Embaralha in-place (listas) e devolve a nova ordem (tuplas)."""
        if isinstance(seq, tuple):
            items = list(seq)
            self._r.shuffle(items)
            return items
        self._r.shuffle(seq)
        return seq

    def sample(self, seq, k: int):
        """Amostra sem repeticao, deterministica."""
        k = max(0, min(k, len(seq)))
        return self._r.sample(list(seq), k)

    def chance(self, probability: float) -> bool:
        return self._r.random() < probability

    def weighted(self, pairs):
        """Escolhe um item a partir de uma lista de pares (item, peso)."""
        total = sum(weight for _, weight in pairs)
        if total <= 0:
            return pairs[0][0]
        roll = self._r.random() * total
        upto = 0.0
        for item, weight in pairs:
            upto += weight
            if roll < upto:
                return item
        return pairs[-1][0]

    # ------------------------------------------------------------- derivados
    def fork(self, tag: str) -> "Rng":
        """Cria um fluxo independente e determinístico a partir deste."""
        self._fork_count += 1
        key = f"{self.seed}:{tag}:{self._fork_count}".encode("utf-8")
        return Rng(zlib.crc32(key) & 0xFFFFFFFF)

    def derived_seed(self, tag: str) -> int:
        key = f"{self.seed}:{tag}".encode("utf-8")
        return zlib.crc32(key) & 0xFFFFFFFF


def random_seed() -> int:
    """Seed aleatoria de 32 bits."""
    return random.SystemRandom().randint(0, 0xFFFFFFFF)
