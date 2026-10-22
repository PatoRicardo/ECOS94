"""ECOS '94 - ponto de entrada.

Sequencia de boot, menu de titulo e loop principal do jogo.
"""

from __future__ import annotations

import argparse
import sys
import time

from . import audio, view
from .actions import Game
from .render import LCYAN, LGREEN, LGRAY, LRED, WHITE, YELLOW, Renderer
from .rng import random_seed
from .terminal import Terminal, TerminalError

BOOT = (
    ("ECOS ROM v1.04  (c) 1994 ECOS SYSTEMS", WHITE, 0.18),
    ("", WHITE, 0.02),
    ("CPU 8086 @ 7.16 MHz ........... OK", LGRAY, 0.09),
    ("640K BASE MEMORY .............. OK", LGRAY, 0.09),
    ("SONAR ARRAY ................... OK", LGRAY, 0.09),
    ("RULER OPTICS .................. OK", LGRAY, 0.09),
    ("LOCK CONTROL .................. OK", LGRAY, 0.09),
    ("LOAD SENSORS .................. OK", LGRAY, 0.09),
    ("PASSWORD VAULT ................ OK", LGRAY, 0.09),
    ("RESET VECTOR .................. OK", LGRAY, 0.09),
    ("", WHITE, 0.02),
    ("BOOTING SECTOR 1...", YELLOW, 0.35),
)

PHOSPHOR_CYCLE = (None, "green", "amber", "white")


def enable_cp437() -> None:
    """Troca o console para a pagina de codigo 437 (fonte DOS de verdade)."""
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleOutputCP(437)
        kernel32.SetConsoleCP(437)
        sys.stdout.reconfigure(encoding="cp437", errors="replace")
    except Exception:
        pass


def boot(term: Terminal, renderer: Renderer) -> None:
    renderer.clear()
    y = 2
    for line, color, delay in BOOT:
        renderer.put_text(2, y, line, color)
        renderer.flush()
        y += 1
        if delay:
            time.sleep(delay)
    time.sleep(0.25)


def read_number(term: Terminal, renderer: Renderer, prompt: str) -> int | None:
    """Le um numero digitado pelo usuario."""
    digits = ""
    while True:
        renderer.put_text(0, term.height - 1, prompt + digits, WHITE)
        renderer.flush()
        kind, ch = term.read_key()
        if kind == "enter":
            break
        if kind == "escape":
            return None
        if kind == "backspace":
            digits = digits[:-1]
            continue
        if kind == "char" and ch.isdigit() and len(digits) < 10:
            digits += ch
    renderer.put_text(0, term.height - 1, " " * term.width, LGRAY)
    return int(digits) if digits else None


def sync_size(term: Terminal, renderer: Renderer) -> None:
    if term.refresh_size():
        renderer.resize(term.width, term.height)
        renderer.invalidate()


def title_loop(term: Terminal, renderer: Renderer, options) -> str:
    """Menu de titulo. Retorna 'new' | 'seed' | 'quit'."""
    while True:
        sync_size(term, renderer)
        view.draw_title(renderer, term.width, term.height, options)
        renderer.flush()
        kind, ch = term.read_key()
        if kind == "ctrl_c":
            return "quit"
        if kind != "char" or not ch:
            continue
        low = ch.lower()
        if low == "n":
            return "new"
        if low == "s":
            return "seed"
        if low == "c":
            current = options.get("phosphor")
            index = PHOSPHOR_CYCLE.index(current) if current in PHOSPHOR_CYCLE else 0
            options["phosphor"] = PHOSPHOR_CYCLE[(index + 1) % len(PHOSPHOR_CYCLE)]
            renderer.set_mode(options["phosphor"], options["scanlines"])
        elif low == "l":
            options["scanlines"] = not options["scanlines"]
            renderer.set_mode(options.get("phosphor"), options["scanlines"])
        elif low == "m":
            options["sound"] = not options.get("sound", True)
            audio.MUTED = not options["sound"]
        elif low == "q":
            return "quit"


def play_run(term: Terminal, renderer: Renderer, seed: int, options) -> str:
    game = Game(seed, options.get("phosphor"), options.get("scanlines", True))
    renderer.set_mode(options.get("phosphor"), options.get("scanlines", True))

    while True:
        sync_size(term, renderer)
        width = term.width
        height = term.height
        view.draw_hud(renderer, game, width)
        vw = width
        vh = max(3, height - 6)
        vx, vy = view.camera(game, vw, vh)
        view.draw_map(renderer, game, vx, vy, vw, vh)
        view.draw_log(renderer, game, width, height)

        prompt = game.prompt or {}
        if game.mode == "help":
            view.draw_help(renderer, width, height)
        elif game.mode == "prompt":
            action = prompt.get("action")
            if prompt.get("kind") == "measure":
                view.draw_measure_hint(renderer, game, width, height)
            elif action == "menu":
                view.draw_inventory(renderer, game, width, height)
            elif action == "itemmenu":
                view.draw_inventory(renderer, game, width, height)
            elif action == "drop":
                entries = [
                    (f"  {i + 1}) {item.name} ({item.kg} KG)", item.color)
                    for i, item in enumerate(prompt.get("items", [])[:9])
                ]
                view.draw_list_panel(
                    renderer, width, height, entries, "DROP WHAT?", "NUMBER TO DROP  ESC TO CANCEL"
                )
            elif action == "use":
                entries = [
                    (f"  {i + 1}) {item.name} ({item.kg} KG)", item.color)
                    for i, item in enumerate(prompt.get("items", [])[:9])
                ]
                view.draw_list_panel(
                    renderer, width, height, entries, "USE WHAT?", "NUMBER TO USE  ESC TO CANCEL"
                )
            elif action == "rom":
                entries = [
                    (f"  {i + 1}) {rom.name} - {rom.desc} ({rom.kg} KG)", YELLOW)
                    for i, rom in enumerate(prompt.get("items", [])[:9])
                ]
                view.draw_list_panel(
                    renderer,
                    width,
                    height,
                    entries,
                    "OVERWRITE WHICH ROM?",
                    "NUMBER TO OVERWRITE  ESC TO CANCEL",
                )

        renderer.flush()

        if game.over:
            if game.victory:
                audio.win()
            else:
                audio.death()
            view.draw_summary(renderer, game, width, height)
            renderer.flush()
            term.read_key()
            return "title"

        kind, ch = term.read_key()
        result = game.handle_key(kind, ch)
        if result == "title":
            return "title"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="ECOS '94 - roguelike ASCII de estetica DOS")
    parser.add_argument(
        "--phosphor",
        choices=("green", "amber", "white"),
        default=None,
        help="cor do monitor (padrao: paleta VGA de 16 cores)",
    )
    parser.add_argument("--no-scanlines", action="store_true", help="desliga as scanlines")
    parser.add_argument("--seed", type=int, default=None, help="seed da run")
    parser.add_argument("--cp437", action="store_true", help="usa a pagina de codigo 437 do DOS")
    parser.add_argument("--mute", action="store_true", help="desliga o som")
    args = parser.parse_args(argv)

    if args.cp437:
        enable_cp437()

    options = {
        "phosphor": args.phosphor,
        "scanlines": not args.no_scanlines,
        "sound": not args.mute,
        "last_seed": 0,
    }
    audio.MUTED = not options["sound"]

    try:
        term = Terminal()
    except TerminalError as exc:
        print(exc)
        return 1

    renderer = Renderer(term, truecolor=term.vt)
    try:
        term.enter()
        boot(term, renderer)
        while True:
            action = title_loop(term, renderer, options)
            if action == "quit":
                break
            if action == "seed":
                seed = read_number(term, renderer, "SEED: ")
                if seed is None:
                    continue
            else:
                seed = args.seed if args.seed is not None else random_seed()
            options["last_seed"] = seed
            play_run(term, renderer, seed, options)
    except KeyboardInterrupt:
        pass
    finally:
        term.leave()
    return 0


if __name__ == "__main__":
    sys.exit(main())
