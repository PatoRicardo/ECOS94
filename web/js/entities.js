/** Entidades do jogo: jogador, monstros, itens e ROMs. */

import { BASE_CAPACITY, ITEMS, MONSTERS, ROMS, ROM_SLOTS } from "./data.js";

export class Item {
  constructor(kind, charges = 1, payload = null) {
    this.kind = kind;
    this.data = ITEMS[kind];
    this.kg = this.data.kg;
    this.charges = charges;
    this.payload = payload;
    this.x = -1;
    this.y = -1;
  }

  get name() {
    return this.data.name;
  }

  /** Categoria do item: weapon | armor | consumable | tool | slate. */
  get category() {
    return this.data.kind;
  }

  get glyph() {
    return this.data.glyph;
  }

  get color() {
    return this.data.color;
  }
}

export class Rom {
  /** Fragmento de memoria somente-leitura. Upgrade permanente. */
  constructor(rom_id) {
    this.data = ROMS.find((rom) => rom.id === rom_id);
    this.kg = this.data.kg;
    this.x = -1;
    this.y = -1;
  }

  get name() {
    return this.data.name;
  }

  get id() {
    return this.data.id;
  }

  get desc() {
    return this.data.desc;
  }
}

export class Monster {
  constructor(kind, depth, rng) {
    const d = MONSTERS[kind];
    this.kind = kind;
    this.data = d;
    this.name = d.name;
    this.glyph = d.glyph;
    this.color = d.color;
    this.max_hp = d.hp + Math.floor(depth / 3);
    this.hp = this.max_hp;
    this.atk = d.atk + Math.floor(depth / 4);
    this.dfn = d.dfn;
    // A velocidade cai devagar: no fim do jogo o primeiro golpe vem
    // antes, mas nada vira "acao a cada turno" no meio da descida.
    this.speed = d.boss ? d.speed : Math.max(1, d.speed - Math.floor(depth / 12));
    this.x = -1;
    this.y = -1;
    this.alive = true;
    this.stun = 0;
    this.behavior = d.behavior;
    this.cooldown = rng.randint(0, this.speed);
  }

  is_adjacent(x, y) {
    return (
      Math.abs(this.x - x) <= 1 &&
      Math.abs(this.y - y) <= 1 &&
      (this.x !== x || this.y !== y)
    );
  }

  distance_to(x, y) {
    return Math.max(Math.abs(this.x - x), Math.abs(this.y - y));
  }
}

export class Player {
  /** O operador, descendo o sistema. */
  constructor() {
    this.max_hp = 28;
    this.hp = 28;
    this.base_atk = 2;
    this.base_dfn = 0;
    this.x = 0;
    this.y = 0;
    this.depth = 1;
    this.inventory = [];
    this.equipped = { weapon: null, armor: null };
    this.roms = [];
    this.noise = 0;
    this.alert = 0;
    this.turns = 0;
    this.kills = 0;
    this.peak_noise = 0;
    this.resets = 0;
    this.sonar_cooldown = 0;

    // modificadores vindos de ROMs
    this.bonus_sonar = 0;
    this.bonus_capacity = 0;
    this.ping_noise_mult = 1.0;
    this.memory_persists = false;
    this.diagnostic = false;
    this.parity = 0;
    this.overclock = false;
    this.cache_radius = 0;
    this.kernel = false;
    this.watchdog = 1.0;
  }

  // ------------------------------------------------------------- derivados
  get atk() {
    const weapon = this.equipped.weapon;
    const bonus = weapon ? weapon.data.atk || 0 : 0;
    return this.base_atk + bonus + this.parity;
  }

  get dfn() {
    const armor = this.equipped.armor;
    const bonus = armor ? armor.data.dfn || 0 : 0;
    return this.base_dfn + bonus;
  }

  get capacity() {
    return BASE_CAPACITY + this.bonus_capacity;
  }

  get load() {
    let total = this.inventory.reduce((sum, item) => sum + item.kg, 0);
    for (const item of Object.values(this.equipped)) {
      if (item) total += item.kg;
    }
    total += this.roms.reduce((sum, rom) => sum + rom.kg, 0);
    return total;
  }

  get load_ratio() {
    const cap = this.capacity;
    return cap ? this.load / cap : 0;
  }

  get load_tier() {
    const ratio = this.load_ratio;
    if (ratio <= 0.5) return "light";
    if (ratio <= 0.75) return "normal";
    if (ratio <= 0.85) return "heavy";
    return "overload";
  }

  get has_ruler() {
    return this.inventory.some((item) => item.kind === "ruler");
  }

  get slates() {
    return this.inventory.filter((item) => item.kind === "slate");
  }

  get passwords() {
    return this.inventory
      .filter((item) => item.kind === "slate" && item.payload)
      .map((item) => item.payload);
  }

  get free_rom_slots() {
    return ROM_SLOTS - this.roms.length;
  }

  alive() {
    return this.hp > 0;
  }
}
