/**
 * Regras de estado: carga, ruido, combate e efeitos de ROM.
 *
 * Funcoes puras: recebem o jogador (e as entidades envolvidas) e devolvem
 * numeros ou descricoes. Nao conhecem a tela nem o loop de jogo.
 */

import { NOISE, SONAR_BASE_RADIUS } from "./data.js";

// --------------------------------------------------------------------- carga
export function step_noise(player, level) {
  /** Ruido gerado por um passo, em funcao da carga e do que esta por perto. */
  if (player.overclock) return 0;
  let amount = NOISE[`step_${player.load_tier}`];
  for (const monster of level.monsters) {
    if (!monster.alive) continue;
    const mult = monster.data.noise_mul || 1;
    if (mult > 1 && monster.distance_to(player.x, player.y) <= 6) {
      amount *= mult;
    }
  }
  return amount;
}

export function sonar_radius(player) {
  return SONAR_BASE_RADIUS + player.bonus_sonar;
}

export function ping_noise(player) {
  let amount = NOISE.ping;
  if (player.overclock) amount += 20;
  return Math.trunc(amount * player.ping_noise_mult);
}

/** Ruido que os proprios monstros fazem: apenas RAT GIANT e audivel. */
export function ambient_noise(player, level) {
  let total = 0;
  for (const monster of level.monsters) {
    if (monster.alive && monster.behavior === "noisy") total += 2;
  }
  return total;
}

// ------------------------------------------------------------------ combate
/** Dano que um monstro causa no jogador. */
export function damage_to_player(player, monster, rng) {
  let raw;
  if (monster.behavior === "wraith") {
    // A wraith drena: ignora armadura.
    raw = monster.atk;
  } else {
    raw = monster.atk - player.dfn;
  }
  raw += rng.randint(-1, 1);
  raw = Math.max(1, raw);
  return Math.max(0, Math.trunc(raw * player.watchdog));
}

/** Dano que o jogador causa num monstro. Retorna { damage, crit }. */
export function damage_to_monster(player, monster, rng) {
  let raw = player.atk - monster.dfn;
  raw += rng.randint(-1, 2);
  raw = Math.max(1, raw);
  const crit = rng.chance(0.05);
  if (crit) raw *= 2;
  return { damage: raw, crit };
}

// --------------------------------------------------------------------- ROMs
/** Aplica o efeito permanente de uma ROM lida. */
export function apply_rom(player, rom) {
  const { effect, value } = rom.data;
  if (effect === "sonar_radius") player.bonus_sonar += value;
  else if (effect === "memory") player.memory_persists = true;
  else if (effect === "ping_noise") player.ping_noise_mult = value;
  else if (effect === "capacity") player.bonus_capacity += value;
  else if (effect === "diagnostic") player.diagnostic = true;
  else if (effect === "parity") player.parity += value;
  else if (effect === "overclock") player.overclock = true;
  else if (effect === "cache") player.cache_radius = Math.max(player.cache_radius, value);
  else if (effect === "kernel") player.kernel = true;
  else if (effect === "watchdog") player.watchdog = value;
}

export function has_rom(player, rom_id) {
  return player.roms.some((rom) => rom.id === rom_id);
}

// ------------------------------------------------------------------ varios
export function nearest_monster(player, level, radius = 1) {
  for (const monster of level.monsters) {
    if (monster.alive && monster.distance_to(player.x, player.y) <= radius) {
      return monster;
    }
  }
  return null;
}
