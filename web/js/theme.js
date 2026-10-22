/**
 * Paleta VGA de 16 cores, modos de fosforo e scanlines.
 *
 * O jogo inteiro fala em indices de cor (0-15), exatamente como o
 * render.py do terminal. Aqui os indices viram CSS/canvas.
 */

export const VGA = [
  [0x00, 0x00, 0x00], // 0  black
  [0x00, 0x00, 0xaa], // 1  blue
  [0x00, 0xaa, 0x00], // 2  green
  [0x00, 0xaa, 0xaa], // 3  cyan
  [0xaa, 0x00, 0x00], // 4  red
  [0xaa, 0x00, 0xaa], // 5  magenta
  [0xaa, 0x55, 0x00], // 6  brown
  [0xaa, 0xaa, 0xaa], // 7  light gray
  [0x55, 0x55, 0x55], // 8  dark gray
  [0x55, 0x55, 0xff], // 9  light blue
  [0x55, 0xff, 0x55], // 10 light green
  [0x55, 0xff, 0xff], // 11 light cyan
  [0xff, 0x55, 0x55], // 12 light red
  [0xff, 0x55, 0xff], // 13 light magenta
  [0xff, 0xff, 0x55], // 14 yellow
  [0xff, 0xff, 0xff], // 15 white
];

// Nomes sem numeros magicos espalhados pelo codigo.
export const C = {
  BLACK: 0,
  BLUE: 1,
  GREEN: 2,
  CYAN: 3,
  RED: 4,
  MAGENTA: 5,
  BROWN: 6,
  LGRAY: 7,
  DGRAY: 8,
  LBLUE: 9,
  LGREEN: 10,
  LCYAN: 11,
  LRED: 12,
  LMAGENTA: 13,
  YELLOW: 14,
  WHITE: 15,
};

export const PHOSPHORS = {
  green: [0x33, 0xff, 0x33],
  amber: [0xff, 0xb0, 0x00],
  white: [0xc8, 0xc8, 0xc8],
};

export const PHOSPHOR_CYCLE = [null, "green", "amber", "white"];

const state = {
  phosphor: null,
  scanlines: true,
};

function luma([r, g, b]) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function shade(rgb, intensity = 1) {
  if (!state.phosphor) {
    return rgb.map((v) => Math.round(v * intensity));
  }
  const base = PHOSPHORS[state.phosphor] || PHOSPHORS.green;
  const lum = luma(rgb) * intensity;
  return base.map((v) => Math.round(v * lum));
}

function hex(rgb) {
  return (
    "#" +
    rgb
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Cor de um indice da paleta, opcionalmente escurecida (memoria). */
export function color(index, intensity = 1) {
  const rgb = VGA[index] || VGA[15];
  return hex(shade(rgb, intensity));
}

/** Aplica o modo de video e atualiza as variaveis CSS usadas pelo HUD. */
export function setMode(phosphor, scanlines) {
  state.phosphor = phosphor && PHOSPHORS[phosphor] ? phosphor : null;
  state.scanlines = Boolean(scanlines);

  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const vars = {
    "--ink": color(C.WHITE),
    "--ink-dim": color(C.LGRAY, 0.78),
    "--muted": color(C.DGRAY),
    "--green": color(C.LGREEN),
    "--cyan": color(C.LCYAN),
    "--yellow": color(C.YELLOW),
    "--red": color(C.LRED),
    "--brown": color(C.BROWN),
    "--line": color(C.DGRAY, 0.9),
    "--glow": color(C.LGREEN, 0.55),
    "--bar-empty": color(C.DGRAY, 0.55),
  };
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  document.body.classList.toggle("scanlines", state.scanlines);
  document.body.dataset.phosphor = state.phosphor || "vga";
}

export function getMode() {
  return { phosphor: state.phosphor, scanlines: state.scanlines };
}
