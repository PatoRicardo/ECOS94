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
  spitter: {
    name: "SPITTER",
    glyph: "s",
    hp: 5,
    atk: 2,
    dfn: 0,
    speed: 3,
    hearing: 24,
    sight: 8,
    range: 5,
    color: C.LGREEN,
    behavior: "ranged",
  },
  charger: {
    name: "CHARGER",
    glyph: "c",
    hp: 9,
    atk: 3,
    dfn: 1,
    speed: 2,
    hearing: 32,
    sight: 7,
    color: C.LRED,
    behavior: "charger",
  },
  slime: {
    name: "SLIME",
    glyph: "o",
    hp: 6,
    atk: 2,
    dfn: 0,
    speed: 3,
    hearing: 20,
    sight: 5,
    color: C.LGREEN,
    behavior: "splitter",
  },
  summoner: {
    name: "SUMMONER",
    glyph: "n",
    hp: 10,
    atk: 2,
    dfn: 1,
    speed: 3,
    hearing: 34,
    sight: 9,
    range: 6,
    color: C.LMAGENTA,
    behavior: "summoner",
  },
  sentinel: {
    name: "SENTINEL",
    glyph: "t",
    hp: 14,
    atk: 4,
    dfn: 3,
    speed: 4,
    hearing: 0,
    sight: 9,
    range: 7,
    color: C.LCYAN,
    behavior: "sentinel",
  },
  phantom: {
    name: "PHANTOM",
    glyph: "p",
    hp: 7,
    atk: 3,
    dfn: 1,
    speed: 2,
    hearing: 30,
    sight: 10,
    color: C.LMAGENTA,
    behavior: "phantom",
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
  1: ["rat", "rat", "goblin", "bat"],
  2: ["rat", "goblin", "goblin", "bat", "spitter"],
  3: ["rat", "goblin", "bat", "spitter", "slime", "wraith"],
  4: ["goblin", "bat", "spitter", "slime", "charger", "wraith"],
  5: ["bat", "spitter", "charger", "summoner", "wraith", "rat_giant"],
  6: ["spitter", "charger", "summoner", "sentinel", "wraith", "rat_giant"],
  7: ["charger", "summoner", "sentinel", "phantom", "wraith", "rat_giant"],
  8: ["summoner", "sentinel", "phantom", "charger", "rat_giant"],
  9: ["sentinel", "phantom", "summoner", "rat_giant"],
  10: ["sentinel", "phantom", "rat_giant"],
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
export const MAX_PLAYERS = 5;
export const TURN_TIMEOUT_MS = 4000;
export const RESPAWN_HP_RATIO = 0.5;
export const PLAYER_COLORS = [
  C.WHITE,
  C.LCYAN,
  C.LGREEN,
  C.YELLOW,
  C.LMAGENTA,
];
export const PLAYER_GLYPHS = ["@", "1", "2", "3", "4"];
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
