"""Controle do terminal Windows.

Responsavel por:
  - habilitar VT (sequencias ANSI) no console via ctypes
  - desabilitar o eco do teclado (input cru)
  - entrar/sair do buffer alternativo (o scrollback do shell fica intacto)
  - ler teclas sem esperar Enter
"""

from __future__ import annotations

import os
import shutil
import sys

# ---------------------------------------------------------------- sequencias ANSI
ALT_ON = "\x1b[?1049h"
ALT_OFF = "\x1b[?1049l"
CURSOR_HIDE = "\x1b[?25l"
CURSOR_SHOW = "\x1b[?25h"
CLEAR = "\x1b[2J"
HOME = "\x1b[H"
SGR_RESET = "\x1b[0m"

STD_INPUT_HANDLE = -10
STD_OUTPUT_HANDLE = -11

ENABLE_PROCESSED_OUTPUT = 0x0001
ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
ENABLE_ECHO_INPUT = 0x0004


class TerminalError(RuntimeError):
    """Levantada quando nao ha um terminal de verdade para rodar o jogo."""


def _configure_windows_console() -> bool:
    """Habilita VT no stdout e desliga o eco no stdin. True se deu certo."""
    if os.name != "nt":
        return True
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        kernel32.GetStdHandle.restype = ctypes.c_void_p
        kernel32.GetStdHandle.argtypes = [ctypes.c_uint32]
        kernel32.GetConsoleMode.restype = ctypes.c_int
        kernel32.GetConsoleMode.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        kernel32.SetConsoleMode.restype = ctypes.c_int
        kernel32.SetConsoleMode.argtypes = [ctypes.c_void_p, ctypes.c_uint32]

        out_handle = kernel32.GetStdHandle(STD_OUTPUT_HANDLE)
        mode = ctypes.c_uint32()
        if not kernel32.GetConsoleMode(out_handle, ctypes.byref(mode)):
            return False  # stdout redirecionado: nao e um console
        kernel32.SetConsoleMode(
            out_handle, mode.value | ENABLE_VIRTUAL_TERMINAL_PROCESSING
        )

        in_handle = kernel32.GetStdHandle(STD_INPUT_HANDLE)
        mode_in = ctypes.c_uint32()
        if kernel32.GetConsoleMode(in_handle, ctypes.byref(mode_in)):
            kernel32.SetConsoleMode(
                in_handle, mode_in.value & ~ENABLE_ECHO_INPUT
            )
        return True
    except Exception:
        return False


# ------------------------------------------------------------------- teclas
# Cada tecla e lida como (kind, char). 'kind' e uma das strings abaixo.
UP = "up"
DOWN = "down"
LEFT = "left"
RIGHT = "right"
ENTER = "enter"
BACKSPACE = "backspace"
ESCAPE = "escape"
CHAR = "char"
CTRL_C = "ctrl_c"

# Somente as setas do teclado produzem direcao. Nenhum outro botao
# (WASD, hjkl, vi-keys, numpad) e mapeado aqui de proposito: as letras
# ficam livres para os comandos e nao ha conflito entre elas.
_ARROWS = {
    "H": UP,
    "P": DOWN,
    "K": LEFT,
    "M": RIGHT,
}


class Terminal:
    """ Fachada sobre o terminal: tamanho, entrada crua, buffer alternativo."""

    def __init__(self, min_width: int = 80, min_height: int = 25) -> None:
        self.vt = _configure_windows_console()
        if not self.vt:
            raise TerminalError(
                "ECOS '94 precisa de um terminal de verdade.\n"
                "Rode em um Terminal do Windows, no terminal integrado do VS Code\n"
                "ou em um cmd.exe normal (nao redirecionado)."
            )
        self.min_width = min_width
        self.min_height = min_height
        self.width, self.height = self.get_size()
        self._entered = False

    # ------------------------------------------------------------- tamanho
    def get_size(self) -> tuple[int, int]:
        cols, rows = shutil.get_terminal_size(fallback=(80, 25))
        # Em terminais pequenos nao da para recuperar: mantemos o minimo e
        # deixamos o renderer recortar o que nao couber.
        return max(cols, 20), max(rows, 10)

    def refresh_size(self) -> bool:
        """Atualiza o tamanho. True se mudou (dispara redesenho)."""
        w, h = self.get_size()
        if (w, h) != (self.width, self.height):
            self.width, self.height = w, h
            return True
        return False

    # ------------------------------------------------------- buffer / cursor
    def enter(self) -> None:
        sys.stdout.write(ALT_ON + CLEAR + HOME + SGR_RESET)
        sys.stdout.flush()
        self._entered = True

    def leave(self) -> None:
        if not self._entered:
            return
        sys.stdout.write(SGR_RESET + CURSOR_SHOW + ALT_OFF)
        sys.stdout.flush()
        self._entered = False

    def clear(self) -> None:
        sys.stdout.write(CLEAR + HOME)
        sys.stdout.flush()

    # ---------------------------------------------------------------- escrita
    def write(self, text: str) -> None:
        sys.stdout.write(text)
        sys.stdout.flush()

    # ---------------------------------------------------------------- entrada
    def key_pending(self) -> bool:
        if os.name != "nt":
            return False
        import msvcrt

        return bool(msvcrt.kbhit())

    def read_key(self) -> tuple[str, str]:
        """Le uma tecla. Retorna (kind, char).

        kind e sempre preenchido; char e o caractere quando kind == CHAR.
        """
        if os.name != "nt":
            return self._read_key_fallback()

        import msvcrt

        ch = msvcrt.getwch()
        if ch in ("\x00", "\xe0"):
            # Tecla estendida: setas, numpad, F-keys.
            try:
                code = msvcrt.getwch()
            except Exception:
                return (CHAR, "")
            if code in _ARROWS:
                return (_ARROWS[code], "")
            return (CHAR, "")
        if ch == "\x03":
            return (CTRL_C, "")
        if ch in ("\r", "\n"):
            return (ENTER, "")
        if ch in ("\x08", "\x7f"):
            return (BACKSPACE, "")
        if ch == "\x1b":
            return (ESCAPE, "")
        return (CHAR, ch)

    @staticmethod
    def _read_key_fallback() -> tuple[str, str]:
        """Leitura de tecla para sistemas sem msvcrt (so para testes)."""
        line = sys.stdin.readline()
        if not line:
            return (ESCAPE, "")
        ch = line[0]
        if ch in ("\r", "\n"):
            return (ENTER, "")
        return (CHAR, ch)


def read_key_blocking(term: Terminal) -> tuple[str, str]:
    """Alias semantico: le uma tecla bloqueando ate o usuario apertar algo."""
    return term.read_key()
