"""Regras de estado: carga, ruido, combate e efeitos de ROM.

Funcoes puras: recebem o jogador (e as entidades envolvidas) e devolvem
numeros ou descricoes. Nao conhecem o terminal nem o loop de jogo.
"""

from __future__ import annotations

from .data import NOISE, SONAR_BASE_RADIUS


# --------------------------------------------------------------------- carga
def load_tier(player) -> str:
    return player.load_tier


def step_noise(player, level) -> int:
    """Ruido gerado por um passo, em funcao da carga e do que esta por perto."""
    if player.overclock:
        return 0
    amount = NOISE[f"step_{player.load_tier}"]
    for monster in level.monsters:
        if not monster.alive:
            continue
        mult = monster.data.get("noise_mul", 1)
        if mult > 1 and monster.distance_to(player.x, player.y) <= 6:
            amount *= mult
    return amount


def sonar_radius(player) -> int:
    return SONAR_BASE_RADIUS + player.bonus_sonar


def ping_noise(player) -> int:
    amount = NOISE["ping"]
    if player.overclock:
        amount += 20
    return int(amount * player.ping_noise_mult)


def ambient_noise(player, level) -> int:
    """Ruido que os proprios monstros fazem: apenas RAT GIANT e audivel."""
    total = 0
    for monster in level.monsters:
        if monster.alive and monster.behavior == "noisy":
            total += 2
    return total


# ------------------------------------------------------------------ combate
def damage_to_player(player, monster, rng) -> int:
    """Dano que um monstro causa no jogador."""
    if monster.behavior == "wraith":
        # A wraith drena: ignora armadura.
        raw = monster.atk
    else:
        raw = monster.atk - player.dfn
    raw += rng.randint(-1, 1)
    raw = max(1, raw)
    return max(0, int(raw * player.watchdog))


def damage_to_monster(player, monster, rng) -> tuple[int, bool]:
    """Dano que o jogador causa num monstro. Retorna (dano, critico)."""
    raw = player.atk - monster.dfn
    raw += rng.randint(-1, 2)
    raw = max(1, raw)
    crit = rng.chance(0.05)
    if crit:
        raw *= 2
    return raw, crit


# --------------------------------------------------------------------- ROMs
def apply_rom(player, rom) -> None:
    """Aplica o efeito permanente de uma ROM lida."""
    effect = rom.data["effect"]
    value = rom.data["value"]
    if effect == "sonar_radius":
        player.bonus_sonar += value
    elif effect == "memory":
        player.memory_persists = True
    elif effect == "ping_noise":
        player.ping_noise_mult = value
    elif effect == "capacity":
        player.bonus_capacity += value
    elif effect == "diagnostic":
        player.diagnostic = True
    elif effect == "parity":
        player.parity += value
    elif effect == "overclock":
        player.overclock = True
    elif effect == "cache":
        player.cache_radius = max(player.cache_radius, value)
    elif effect == "kernel":
        player.kernel = True
    elif effect == "watchdog":
        player.watchdog = value


def has_rom(player, rom_id: str) -> bool:
    return any(rom.id == rom_id for rom in player.roms)


# ------------------------------------------------------------------ varios
def nearest_monster(player, level, radius: int = 1):
    for monster in level.monsters:
        if monster.alive and monster.distance_to(player.x, player.y) <= radius:
            return monster
    return None
