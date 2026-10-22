/**
 * Gerador deterministico semeado.
 *
 * Todo o acaso do jogo passa por aqui: mesma seed, mesmo mapa, mesmo
 * loot e mesma IA. A implementacao usa mulberry32 + CRC32 para os forks,
 * entao a sequencia nao e identica ao random.Random do Python, mas e
 * igualmente reproduzivel dentro da versao web.
 */

/** CRC32 (mesma ideia do zlib.crc32 usado no original). */
export function crc32(text) {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i);
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export class Rng {
  constructor(seed) {
    this.seed = Number(seed) >>> 0;
    this._state = this.seed;
    this._fork_count = 0;
  }

  // ------------------------------------------------------------- basico
  random() {
    // mulberry32
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro inclusivo nos dois extremos, como o randint do Python. */
  randint(a, b) {
    if (b < a) [a, b] = [b, a];
    return a + Math.floor(this.random() * (b - a + 1));
  }

  choice(seq) {
    if (!seq || seq.length === 0) return undefined;
    return seq[Math.floor(this.random() * seq.length)];
  }

  /** Embaralha in-place e devolve a propria sequencia. */
  shuffle(seq) {
    for (let i = seq.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [seq[i], seq[j]] = [seq[j], seq[i]];
    }
    return seq;
  }

  /** Amostra sem repeticao (copia embaralhada parcial). */
  sample(seq, k) {
    const pool = Array.from(seq);
    const n = pool.length;
    const count = Math.max(0, Math.min(k, n));
    for (let i = 0; i < count; i += 1) {
      const j = i + Math.floor(this.random() * (n - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  chance(probability) {
    return this.random() < probability;
  }

  /** Escolhe a partir de pares [item, peso]. */
  weighted(pairs) {
    const total = pairs.reduce((sum, pair) => sum + pair[1], 0);
    if (total <= 0) return pairs[0][0];
    const roll = this.random() * total;
    let upto = 0;
    for (const [item, weight] of pairs) {
      upto += weight;
      if (roll < upto) return item;
    }
    return pairs[pairs.length - 1][0];
  }

  // ---------------------------------------------------------- derivados
  fork(tag) {
    this._fork_count += 1;
    return new Rng(crc32(`${this.seed}:${tag}:${this._fork_count}`));
  }

  derived_seed(tag) {
    return crc32(`${this.seed}:${tag}`);
  }
}

/** Seed aleatoria de 32 bits. */
export function random_seed() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
