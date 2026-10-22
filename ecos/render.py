"""Renderizador de tela.

Cuida de:
  - paleta IBM VGA de 16 cores em truecolor 24-bit
  - modo fosforo (monocromatico verde/ambar/branco) e scanlines
  - framebuffer de caracteres com diff de linhas (sem flicker)
"""

from __future__ import annotations

from .terminal import CLEAR, HOME, SGR_RESET

# --------------------------------------------------------------- paleta VGA
VGA = (
    (0x00, 0x00, 0x00),  # 0  black
    (0x00, 0x00, 0xAA),  # 1  blue
    (0x00, 0xAA, 0x00),  # 2  green
    (0x00, 0xAA, 0xAA),  # 3  cyan
    (0xAA, 0x00, 0x00),  # 4  red
    (0xAA, 0x00, 0xAA),  # 5  magenta
    (0xAA, 0x55, 0x00),  # 6  brown
    (0xAA, 0xAA, 0xAA),  # 7  light gray
    (0x55, 0x55, 0x55),  # 8  dark gray
    (0x55, 0x55, 0xFF),  # 9  light blue
    (0x55, 0xFF, 0x55),  # 10 light green
    (0x55, 0xFF, 0xFF),  # 11 light cyan
    (0xFF, 0x55, 0x55),  # 12 light red
    (0xFF, 0x55, 0xFF),  # 13 light magenta
    (0xFF, 0xFF, 0x55),  # 14 yellow
    (0xFF, 0xFF, 0xFF),  # 15 white
)

# Nomes de cor para indexacao sem numeros magicos.
BLACK, BLUE, GREEN, CYAN, RED, MAGENTA, BROWN, LGRAY = range(8)
DGRAY, LBLUE, LGREEN, LCYAN, LRED, LMAGENTA, YELLOW, WHITE = range(8, 16)

PHOSPHORS = {
    "green": (0x33, 0xFF, 0x33),
    "amber": (0xFF, 0xB0, 0x00),
    "white": (0xC8, 0xC8, 0xC8),
}

_SCANLINE_FACTOR = 0.55
_ANSI16_BASE = (30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97)


def _luma(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0


# ------------------------------------------------------------------ glifos
G_UNKNOWN = " "
G_FLOOR = "\u00b7"  # ponto medio
G_WALL = "\u2588"  # bloco cheio
G_WALL_SOFT = "\u2592"  # sombra media
G_DOOR = "+"
G_STAIRS_UP = "<"
G_STAIRS_DOWN = ">"
G_PLAYER = "@"
G_BEAM = "\u2500"  # linha horizontal
G_BAR_FULL = "\u2588"
G_BAR_EMPTY = "\u2591"  # sombra leve
G_ITEM = "!"
G_ROM = "R"
G_SLATE = "="
GRAY_DIV = "\u2500"  # divisor horizontal

# Fonte 5x5 para o logotipo da tela de titulo.
BIGFONT = {
    "E": ("#####", "#....", "####.", "#....", "#####"),
    "C": (".####", "#....", "#....", "#....", ".####"),
    "O": (".###.", "#...#", "#...#", "#...#", ".###."),
    "S": (".####", "#....", ".###.", "....#", "####."),
    "9": (".###.", "#...#", ".####", "....#", ".###."),
    "4": ("#..#.", "#..#.", "#####", "...#.", "...#."),
    "'": ("..#..", "..#..", ".....", ".....", "....."),
    " ": (".....", ".....", ".....", ".....", "....."),
    "-": (".....", ".....", "#####", ".....", "....."),
    ".": (".....", ".....", ".....", ".....", "..#.."),
}


def big_text(text: str, fg: int = WHITE) -> list[str]:
    """Renderiza texto na fonte 5x5. Retorna as linhas ja prontas."""
    rows = ["", "", "", "", ""]
    for ch in text.upper():
        glyph = BIGFONT.get(ch, BIGFONT[" "])
        for i in range(5):
            rows[i] += glyph[i] + " "
    return [r.rstrip() for r in rows]


class Renderer:
    """Framebuffer de caracteres com saida diffada linha a linha."""

    def __init__(self, term, truecolor: bool = True) -> None:
        self.term = term
        self.truecolor = truecolor
        self.phosphor: str | None = None
        self.scanlines = True
        self.width = term.width
        self.height = term.height
        self.buffer: list[list[tuple[str, int, int]]] = []
        self._prev: list[str] | None = None
        self._rebuild()

    # ---------------------------------------------------------- configuracao
    def set_mode(self, phosphor: str | None, scanlines: bool) -> None:
        self.phosphor = phosphor if phosphor in PHOSPHORS else None
        self.scanlines = bool(scanlines)
        self._rebuild()

    def resize(self, width: int, height: int) -> None:
        if (width, height) == (self.width, self.height):
            return
        self.width = width
        self.height = height
        self.buffer = []
        self._prev = None
        self._rebuild()

    def _rebuild(self) -> None:
        self._fg_tables = []
        self._bg_tables = []
        for parity in (0, 1):
            fg = []
            bg = []
            for idx, rgb in enumerate(VGA):
                fg.append(self._make_fg(idx, rgb, parity))
                bg.append(self._make_bg(idx, rgb, parity))
            self._fg_tables.append(fg)
            self._bg_tables.append(bg)
        self.buffer = [
            [(G_UNKNOWN, WHITE, BLACK) for _ in range(self.width)]
            for _ in range(self.height)
        ]

    def _shade(self, rgb: tuple[int, int, int], parity: int) -> tuple[int, int, int]:
        r, g, b = rgb
        if self.phosphor:
            base = PHOSPHORS[self.phosphor]
            intensity = _luma(rgb)
            r = int(base[0] * intensity)
            g = int(base[1] * intensity)
            b = int(base[2] * intensity)
        if self.scanlines and parity:
            r = int(r * _SCANLINE_FACTOR)
            g = int(g * _SCANLINE_FACTOR)
            b = int(b * _SCANLINE_FACTOR)
        return (r, g, b)

    def _make_fg(self, idx: int, rgb: tuple[int, int, int], parity: int) -> str:
        if not self.truecolor:
            return f"\x1b[{_ANSI16_BASE[idx]}m"
        r, g, b = self._shade(rgb, parity)
        return f"\x1b[38;2;{r};{g};{b}m"

    def _make_bg(self, idx: int, rgb: tuple[int, int, int], parity: int) -> str:
        if not self.truecolor:
            base = 40 if idx < 8 else 100
            return f"\x1b[{base + _ANSI16_BASE[idx] - 30}m"
        r, g, b = self._shade(rgb, parity)
        return f"\x1b[48;2;{r};{g};{b}m"

    # ------------------------------------------------------------- primitivas
    def clear(self, fg: int = WHITE, bg: int = BLACK) -> None:
        fill = (G_UNKNOWN, fg, bg)
        for y in range(self.height):
            self.buffer[y] = [fill] * self.width

    def put(self, x: int, y: int, ch: str, fg: int = WHITE, bg: int = BLACK) -> None:
        if 0 <= y < self.height and 0 <= x < self.width:
            self.buffer[y][x] = (ch, fg, bg)

    def put_text(self, x: int, y: int, text: str, fg: int = WHITE, bg: int = BLACK) -> None:
        if not (0 <= y < self.height):
            return
        row = self.buffer[y]
        for i, ch in enumerate(text):
            px = x + i
            if 0 <= px < self.width:
                row[px] = (ch, fg, bg)
            elif px >= self.width:
                break

    def fill(self, x: int, y: int, w: int, h: int, ch: str, fg: int, bg: int) -> None:
        for yy in range(y, y + h):
            if not (0 <= yy < self.height):
                continue
            for xx in range(x, x + w):
                if 0 <= xx < self.width:
                    self.buffer[yy][xx] = (ch, fg, bg)

    def hline(self, x: int, y: int, w: int, ch: str, fg: int, bg: int = BLACK) -> None:
        self.fill(x, y, w, 1, ch, fg, bg)

    def bar(self, x: int, y: int, w: int, value: float, maximum: float,
            fg: int = LGREEN, empty_fg: int = DGRAY) -> None:
        """Barra horizontal simples."""
        if maximum <= 0:
            filled = 0
        else:
            filled = int(round((max(0.0, min(1.0, value / maximum)) * w)))
        self.put_text(x, y, G_BAR_FULL * filled, fg)
        self.put_text(x + filled, y, G_BAR_EMPTY * (w - filled), empty_fg)

    # ---------------------------------------------------------------- saida
    def _row_string(self, y: int) -> str:
        fg_table = self._fg_tables[y & 1]
        bg_table = self._bg_tables[y & 1]
        row = self.buffer[y]
        parts: list[str] = []
        cur_fg = -1
        cur_bg = -1
        for x in range(self.width):
            ch, fg, bg = row[x]
            if fg != cur_fg:
                parts.append(fg_table[fg])
                cur_fg = fg
            if bg != cur_bg:
                parts.append(bg_table[bg])
                cur_bg = bg
            parts.append(ch)
        parts.append(SGR_RESET)
        return "".join(parts)

    def flush(self) -> None:
        rows = [self._row_string(y) for y in range(self.height)]
        out: list[str] = []
        if self._prev is None:
            out.append(CLEAR)
            out.append(HOME)
            for i, row in enumerate(rows):
                out.append(f"\x1b[{i + 1};1H")
                out.append(row)
        else:
            for i, row in enumerate(rows):
                if self._prev[i] != row:
                    out.append(f"\x1b[{i + 1};1H")
                    out.append(row)
        self._prev = rows
        if out:
            self.term.write("".join(out))

    def invalidate(self) -> None:
        """Forca o proximo flush a repintar tudo."""
        self._prev = None
