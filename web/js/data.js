/** Tabelas de dados do jogo: monstros, itens, ROMs e senhas. */

import { C } from "./theme.js";

// ------------------------------------------------------------------ monstros
// speed = turnos entre acoes (menor = mais rapido)
// hearing = limiar de ruido a partir do qual o monstro persegue
// sight = distancia de percepcao passiva
export const MONSTERS = {
  rat: {
    name: "RAT",
    glyph: "r",
    hp: 3,
    atk: 1,
    dfn: 0,
    speed: 3,
    hearing: 22,
    sight: 6,
    color: C.LGRAY,
    behavior: "rat",
    noise_mul: 2,
  },
  goblin: {
    name: "GOBLIN",
    glyph: "g",
    hp: 6,
    atk: 2,
    dfn: 0,
    speed: 2,
    hearing: 30,
    sight: 7,
    color: C.GREEN,
    behavior: "normal",
  },
  bat: {
    name: "BAT",
    glyph: "B",
    hp: 4,
    atk: 2,
    dfn: 0,
    speed: 4,
    hearing: 26,
    sight: 8,
    color: C.LMAGENTA,
    behavior: "erratic",
  },
  wraith: {
    name: "WRAITH",
    glyph: "w",
    hp: 8,
    atk: 3,
    dfn: 1,
    speed: 2,
    hearing: 34,
    sight: 8,
    color: C.LCYAN,
    behavior: "wraith",
  },
  rat_giant: {
    name: "RAT GIANT",
    glyph: "k",
    hp: 12,
    atk: 3,
    dfn: 1,
    speed: 2,
    hearing: 38,
    sight: 7,
    color: C.BROWN,
    behavior: "noisy",
  },
  devourer: {
    name: "DEVOURER",
    glyph: "X",
    hp: 30,
    atk: 5,
    dfn: 2,
    speed: 2,
    hearing: 0,
    sight: 14,
    color: C.LRED,
    behavior: "hunter",
    boss: true,
  },
};

// Ordem de aparicao por profundidade: quanto mais fundo, mais bicho.
export const SPAWN_TABLE = {
  1: ["rat", "rat", "goblin"],
  2: ["rat", "goblin", "goblin", "bat"],
  3: ["rat", "goblin", "bat", "bat", "wraith"],
  4: ["goblin", "bat", "wraith", "wraith", "rat_giant"],
  5: ["goblin", "bat", "wraith", "rat_giant", "rat_giant"],
  6: ["bat", "wraith", "wraith", "rat_giant"],
  7: ["wraith", "wraith", "rat_giant", "rat_giant"],
  8: ["wraith", "rat_giant", "rat_giant"],
  9: ["rat_giant", "rat_giant", "wraith"],
  10: ["rat_giant", "rat_giant"],
};

// ---------------------------------------------------------------------- itens
// kind: weapon | armor | consumable | tool | slate | rom
export const ITEMS = {
  dagger: {
    name: "DAGGER",
    glyph: "!",
    kg: 2,
    kind: "weapon",
    atk: 1,
    color: C.YELLOW,
  },
  cleaver: {
    name: "CLEAVER",
    glyph: ")",
    kg: 5,
    kind: "weapon",
    atk: 3,
    color: C.YELLOW,
  },
  plate: {
    name: "PLATE",
    glyph: "[",
    kg: 6,
    kind: "armor",
    dfn: 1,
    color: C.LCYAN,
  },
  ampola: {
    name: "AMPOLA",
    glyph: "?",
    kg: 1,
    kind: "consumable",
    heal: 12,
    color: C.LGREEN,
  },
  ruler: {
    name: "RULER",
    glyph: "/",
    kg: 1,
    kind: "tool",
    color: C.LCYAN,
  },
  damper: {
    name: "DAMPER",
    glyph: "%",
    kg: 1,
    kind: "consumable",
    noise: -30,
    color: C.GREEN,
  },
  shocker: {
    name: "SHOCKER",
    glyph: "*",
    kg: 2,
    kind: "consumable",
    stun: 4,
    noise: 60,
    color: C.LMAGENTA,
  },
  slate: {
    name: "SLATE",
    glyph: "=",
    kg: 1,
    kind: "slate",
    color: C.BROWN,
  },
};

// ---------------------------------------------------------------------- ROMs
// effect: chave interpretada em status.apply_rom()
export const ROMS = [
  {
    id: "widening",
    name: "WIDENING",
    kg: 9,
    effect: "sonar_radius",
    value: 3,
    desc: "SONAR RADIUS +3",
  },
  {
    id: "persistence",
    name: "PERSISTENCE",
    kg: 11,
    effect: "memory",
    value: 1,
    desc: "REMEMBERED TILES NEVER FADE",
  },
  {
    id: "dampener",
    name: "DAMPENER",
    kg: 12,
    effect: "ping_noise",
    value: 0.5,
    desc: "PING NOISE HALVED",
  },
  {
    id: "buffer",
    name: "BUFFER",
    kg: 14,
    effect: "capacity",
    value: 25,
    desc: "LOAD CAPACITY +25 KG",
  },
  {
    id: "diagnostic",
    name: "DIAGNOSTIC",
    kg: 8,
    effect: "diagnostic",
    value: 1,
    desc: "FULL LAYOUT ON ENTRY",
  },
  {
    id: "parity",
    name: "PARITY",
    kg: 10,
    effect: "parity",
    value: 2,
    desc: "DAMAGE +2",
  },
  {
    id: "overclock",
    name: "OVERCLOCK",
    kg: 13,
    effect: "overclock",
    value: 1,
    desc: "STEPS ARE SILENT, PING +20",
  },
  {
    id: "cache",
    name: "CACHE",
    kg: 8,
    effect: "cache",
    value: 8,
    desc: "ITEMS VISIBLE AT 8 TILES",
  },
  {
    id: "kernel",
    name: "KERNEL",
    kg: 15,
    effect: "kernel",
    value: 1,
    desc: "UNLOCK WITHOUT NOISE",
  },
  {
    id: "watchdog",
    name: "WATCHDOG",
    kg: 12,
    effect: "watchdog",
    value: 0.5,
    desc: "DAMAGE TAKEN HALVED",
  },
];

export const ROM_SLOTS = 3;

// -------------------------------------------------------------------- senhas
export const PASSWORD_WORDS = [
  "ECOS",
  "ROM",
  "LOCK",
  "LOAD",
  "RULER",
  "RESET",
  "PASS",
  "SECTOR",
  "DEPTH",
  "SONAR",
  "NULL",
  "VOID",
  "ROOT",
  "SYS",
  "BOOT",
  "CACHE",
  "STACK",
  "HEAP",
  "GAIN",
  "MASK",
  "PORT",
  "BUS",
  "CORE",
  "HALO",
  "DARK",
  "ECHO",
];

// ------------------------------------------------------------------ constantes
export const MAX_DEPTH = 10;
export const BASE_CAPACITY = 40;
export const NOISE_MAX = 100;
export const NOISE_DECAY = 4;

export const NOISE = {
  step_light: 1,
  step_normal: 3,
  step_heavy: 6,
  step_overload: 10,
  ping: 30,
  ruler: 2,
  lock: 4,
  unlock: 4,
  combat: 4,
  brute: 8,
  purge: 40,
  shocker: 60,
};

export const SONAR_BASE_RADIUS = 6;
export const SONAR_COOLDOWN = 3;
export const MEMORY_FADE_TURNS = 8;
export const PERSONAL_RADIUS = 1;

export const DOOR_OPEN = "open";
export const DOOR_CLOSED = "closed";
export const DOOR_LOCKED = "locked";
