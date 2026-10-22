"""Camada de desenho: mapa, HUD, paineis e telas.

Tudo aqui desenha no framebuffer do Renderer; nenhuma logica de jogo.
"""

from __future__ import annotations

from .data import DOOR_CLOSED, DOOR_LOCKED, DOOR_OPEN, MAX_DEPTH
from .render import (
    BLACK,
    BROWN,
    DGRAY,
    G_FLOOR,
    G_PLAYER,
    G_STAIRS_DOWN,
    G_STAIRS_UP,
    G_WALL,
    GRAY_DIV,
    GREEN,
    LCYAN,
    LGRAY,
    LGREEN,
    LRED,
    LMAGENTA,
    RED,
    WHITE,
    YELLOW,
    big_text,
)

# caixa de dialogo
BOX_TL, BOX_TR, BOX_BL, BOX_BR = "\u250c", "\u2510", "\u2514", "\u2518"
BOX_H, BOX_V = "\u2500", "\u2502"


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def camera(game, vw: int, vh: int) -> tuple[int, int]:
    """Posicao do canto superior esquerdo da viewport."""
    level = game.level
    px, py = game.player.x, game.player.y
    if level.w <= vw:
        vx = (level.w - vw) // 2
    else:
        vx = _clamp(px - vw // 2, 0, level.w - vw)
    if level.h <= vh:
        vy = (level.h - vh) // 2
    else:
        vy = _clamp(py - vh // 2, 0, level.h - vh)
    return vx, vy


def draw_map(r, game, vx: int, vy: int, vw: int, vh: int) -> None:
    level = game.level
    player = game.player
    beam = set(game.beam) if game.turn - game.beam_turn <= 4 else set()

    for row in range(vh):
        y = vy + row
        if y < 0 or y >= level.h:
            continue
        for col in range(vw):
            x = vx + col
            if x < 0 or x >= level.w:
                continue
            known = level.known[y][x]
            if known == 0:
                continue
            tile = level.tiles[y][x]
            lit = known == 2
            if tile.kind == "wall":
                r.put(col, row, G_WALL, WHITE if lit else DGRAY)
            elif tile.kind == "door":
                if tile.door == DOOR_LOCKED:
                    r.put(col, row, "+", LRED)
                elif tile.door == DOOR_CLOSED:
                    r.put(col, row, "+", BROWN)
                else:
                    r.put(col, row, "+", GREEN)
            else:
                r.put(col, row, G_FLOOR, WHITE if lit else DGRAY)
            if (x, y) in beam:
                r.put(col, row, "\u2500", LCYAN)

    # escadas
    sx, sy = level.stairs_up
    if level.known[sy][sx] and 0 <= sx - vx < vw and 0 <= sy - vy < vh:
        r.put(sx - vx, sy - vy, G_STAIRS_UP, LGRAY)
    sx, sy = level.stairs_down
    if level.known[sy][sx] and 0 <= sx - vx < vw and 0 <= sy - vy < vh:
        r.put(sx - vx, sy - vy, G_STAIRS_DOWN, YELLOW)

    # itens lembrados
    for item in level.items:
        if not (0 <= item.x - vx < vw and 0 <= item.y - vy < vh):
            continue
        if level.known[item.y][item.x] == 0:
            continue
        r.put(item.x - vx, item.y - vy, item.glyph, item.color)

    # ROMs
    for rom in level.roms_on_floor:
        if not (0 <= rom.x - vx < vw and 0 <= rom.y - vy < vh):
            continue
        if level.known[rom.y][rom.x] == 0:
            continue
        r.put(rom.x - vx, rom.y - vy, "R", YELLOW)

    # monstros: so os que estao iluminados agora
    for monster in level.monsters:
        if not monster.alive:
            continue
        if not (0 <= monster.x - vx < vw and 0 <= monster.y - vy < vh):
            continue
        if level.known[monster.y][monster.x] != 2:
            continue
        r.put(monster.x - vx, monster.y - vy, monster.glyph, monster.color)

    # jogador
    r.put(player.x - vx, player.y - vy, G_PLAYER, WHITE)


def draw_hud(r, game, width: int) -> None:
    player = game.player
    load_ratio = player.load_ratio
    noise_ratio = player.noise / 100.0

    hp_color = LGREEN if player.hp > 5 else LRED
    noise_color = LGREEN if noise_ratio < 0.4 else (YELLOW if noise_ratio < 0.8 else LRED)
    load_color = LGREEN if load_ratio <= 0.75 else (YELLOW if load_ratio <= 0.85 else LRED)

    r.put_text(0, 0, "ECOS '94", LCYAN)

    if width >= 108:
        # layout completo: barras para carga e ruido
        x = 9
        r.put_text(x, 0, f"SECTOR {game.depth}/{MAX_DEPTH}", YELLOW)
        x += 17
        r.put_text(x, 0, f"HP {player.hp}/{player.max_hp}", hp_color)
        x += 12
        r.put_text(x, 0, f"ATK {player.atk}", WHITE)
        x += 8
        r.put_text(x, 0, f"DEF {player.dfn}", WHITE)
        x += 8
        r.put_text(x, 0, "LOAD", WHITE)
        x += 5
        r.bar(x, 0, 8, load_ratio, 1.0, load_color, DGRAY)
        x += 9
        r.put_text(x, 0, f"{player.load}/{player.capacity}", WHITE)
        x += 11
        r.put_text(x, 0, "NOISE", WHITE)
        x += 6
        r.bar(x, 0, 8, noise_ratio, 1.0, noise_color, DGRAY)
        x += 9
        r.put_text(x, 0, f"{player.noise}", WHITE)
        x += 6
        r.put_text(x, 0, f"ALERT {player.alert}", LRED if player.alert else DGRAY)
    else:
        # layout compacto: cabe em 80 colunas sem cortar nada
        x = 9
        r.put_text(x, 0, f"S{game.depth:02d}/{MAX_DEPTH}", YELLOW)
        x += 8
        r.put_text(x, 0, f"HP {player.hp}/{player.max_hp}", hp_color)
        x += 10
        r.put_text(x, 0, f"ATK {player.atk}", WHITE)
        x += 7
        r.put_text(x, 0, f"DEF {player.dfn}", WHITE)
        x += 7
        r.put_text(x, 0, "LOAD", WHITE)
        x += 5
        r.bar(x, 0, 6, load_ratio, 1.0, load_color, DGRAY)
        x += 7
        r.put_text(x, 0, f"{player.load}/{player.capacity}", WHITE)
        x += 7
        r.put_text(x, 0, f"NZ {player.noise}", noise_color)
        x += 6
        r.put_text(x, 0, f"AL {player.alert}", LRED if player.alert else DGRAY)

    # linha de ROMs
    roms = ", ".join(rom.name for rom in player.roms) or "-"
    r.put_text(0, 1, "ROMS: ", LGRAY)
    r.put_text(6, 1, roms, YELLOW)
    slot_text = f"SLOTS {len(player.roms)}/3"
    r.put_text(max(0, width - len(slot_text)), 1, slot_text, LGRAY)

    r.put_text(0, 2, GRAY_DIV * width, DGRAY)


def draw_list_panel(r, width: int, height: int, entries, title: str, hint: str = "") -> None:
    """Painel generico com lista numerada."""
    w = min(width - 4, 58)
    h = min(height - 4, 22)
    x = (width - w) // 2
    y = (height - h) // 2
    lines = list(entries)
    lines.append(("", WHITE))
    if hint:
        lines.append((hint, LGRAY))
    draw_panel(r, x, y, w, h, title, lines)


def draw_measure_hint(r, game, width: int, height: int) -> None:
    r.put_text(0, height - 2, "RULER: CHOOSE A DIRECTION (ESC CANCELS)", LCYAN)


def draw_log(r, game, width: int, height: int) -> None:
    r.put_text(0, height - 3, GRAY_DIV * width, DGRAY)
    messages = game.messages[-2:]
    for i, (text, color) in enumerate(messages):
        r.put_text(0, height - 2 + i, text[:width], color)


def draw_panel(r, x: int, y: int, w: int, h: int, title: str, lines) -> None:
    """Caixa de dialogo com titulo."""
    r.fill(x, y, w, h, " ", WHITE, BLACK)
    r.put_text(x, y, BOX_TL + BOX_H * (w - 2) + BOX_TR, LCYAN)
    r.put_text(x, y + h - 1, BOX_BL + BOX_H * (w - 2) + BOX_BR, LCYAN)
    for i in range(1, h - 1):
        r.put_text(x, y + i, BOX_V, LCYAN)
        r.put_text(x + w - 1, y + i, BOX_V, LCYAN)
    if title:
        r.put_text(x + 2, y, f" {title} ", LCYAN)
    for i, (text, color) in enumerate(lines):
        if y + 1 + i >= y + h - 1:
            break
        r.put_text(x + 2, y + 1 + i, str(text)[: w - 4], color)


def draw_help(r, width: int, height: int) -> None:
    w = min(width - 4, 60)
    h = min(height - 4, 20)
    x = (width - w) // 2
    y = (height - h) // 2
    lines = [
        ("MOVE     ARROWS  WASD  VI-KEYS  NUMPAD", WHITE),
        ("S / P    SONAR PING (LOUD, 30 NOISE)", LCYAN),
        ("M        RULER MEASURE - DIRECTION (2 NOISE)", LCYAN),
        ("L        LOCK THE DOOR BESIDE YOU", YELLOW),
        ("U        UNLOCK THE DOOR BESIDE YOU", YELLOW),
        ("B        FORCE A LOCKED DOOR (3 TRIES)", LRED),
        ("G        TAKE WHAT IS UNDER YOU", LGREEN),
        ("D        DROP SOMETHING (LOAD!)", LGREEN),
        ("I        INVENTORY", LGREEN),
        ("X        RESET THE SECTOR (COSTS ALERT)", LRED),
        (".        WAIT ONE TURN", LGRAY),
        ("?        THIS SCREEN", LGRAY),
        ("Q        QUIT TO TITLE", LGRAY),
        ("", WHITE),
        ("REMEMBER: EVERY LOOKOUT COSTS NOISE.", YELLOW),
        ("PRESS ANY KEY TO CLOSE", LGRAY),
    ]
    draw_panel(r, x, y, w, h, "ECOS '94 - HELP", lines)


def draw_inventory(r, game, width: int, height: int) -> None:
    player = game.player
    w = min(width - 4, 58)
    h = min(height - 4, 22)
    x = (width - w) // 2
    y = (height - h) // 2
    lines = []
    lines.append((f"LOAD {player.load}/{player.capacity}  ({player.load_tier.upper()})", WHITE))
    lines.append((f"HP {player.hp}/{player.max_hp}  ATK {player.atk}  DEF {player.dfn}", WHITE))
    lines.append(("", WHITE))
    lines.append(("EQUIPMENT", LGRAY))
    weapon = player.equipped.get("weapon")
    armor = player.equipped.get("armor")
    lines.append((f"  WEAPON: {weapon.name if weapon else '-'}", WHITE))
    lines.append((f"  ARMOR : {armor.name if armor else '-'}", WHITE))
    lines.append(("", WHITE))
    lines.append(("CARRIED", LGRAY))
    if player.inventory:
        for i, item in enumerate(player.inventory[:9]):
            extra = ""
            if item.kind == "slate" and item.payload:
                extra = f"  PASSWORD: {item.payload}"
            lines.append((f"  {i + 1}) {item.name} ({item.kg} KG){extra}", item.color))
    else:
        lines.append(("  (EMPTY)", DGRAY))
    lines.append(("", WHITE))
    lines.append(("ROMS (PERMANENT, CANNOT BE DROPPED)", LGRAY))
    for i, rom in enumerate(player.roms):
        lines.append((f"  {i + 1}) {rom.name} - {rom.desc} ({rom.kg} KG)", YELLOW))
    lines.append(("", WHITE))
    lines.append(("[U] USE   [D] DROP   [ESC] CLOSE", LGRAY))
    draw_panel(r, x, y, w, h, "INVENTORY", lines)


def draw_title(r, width: int, height: int, options) -> None:
    r.clear(WHITE, BLACK)
    logo = big_text("ECOS '94")
    top = max(2, height // 2 - 11)
    for i, line in enumerate(logo):
        r.put_text(max(0, (width - len(line)) // 2), top + i, line, LGREEN)
    r.put_text(
        max(0, (width - 34) // 2), top + 6, "A ROGUELIKE IN THE DARK", LCYAN
    )
    r.put_text(
        max(0, (width - 46) // 2),
        top + 7,
        "EVERY LOOKOUT COSTS NOISE. NOISE ATTRACTS.",
        DGRAY,
    )
    r.put_text(0, top + 9, GRAY_DIV * width, DGRAY)

    menu = [
        ("N", "NEW RUN"),
        ("S", "ENTER SEED"),
        ("C", f"COLOR: {(options.get('phosphor') or 'VGA 16').upper()}"),
        ("L", f"SCANLINES: {'ON' if options.get('scanlines') else 'OFF'}"),
        ("M", "SOUND: " + ("ON" if options.get("sound") else "OFF")),
        ("Q", "QUIT"),
    ]
    x = max(0, (width - 26) // 2)
    for i, (key, label) in enumerate(menu):
        y = top + 10 + i
        r.put_text(x, y, f"[{key}]", YELLOW)
        r.put_text(x + 5, y, label, WHITE)
    r.put_text(
        max(0, (width - 46) // 2),
        height - 3,
        "ARROWS/WASD/VI-KEYS MOVE   ? HELP IN GAME",
        DGRAY,
    )
    r.put_text(
        max(0, (width - 30) // 2),
        height - 2,
        f"LAST SEED: {options.get('last_seed', 0)}",
        DGRAY,
    )


def draw_summary(r, game, width: int, height: int) -> None:
    r.clear(WHITE, BLACK)
    player = game.player
    title = "ECOS RECLAIMED" if game.victory else "RUN TERMINATED"
    color = LGREEN if game.victory else LRED
    w = min(width - 4, 56)
    h = 18
    x = (width - w) // 2
    y = max(1, (height - h) // 2)
    lines = [
        (game.cause or "THE DARK TOOK YOU", color),
        ("", WHITE),
        (f"SECTOR REACHED     {game.depth} / {MAX_DEPTH}", WHITE),
        (f"TURNS TAKEN         {player.turns}", WHITE),
        (f"KILLS              {player.kills}", WHITE),
        (f"PEAK NOISE         {player.peak_noise}", WHITE),
        (f"RESETS USED        {player.resets}", WHITE),
        (f"ALERT LEVEL        {player.alert}", WHITE),
        (f"LOAD AT END        {player.load} / {player.capacity} KG", WHITE),
        ("", WHITE),
        ("ROMS READ: " + (", ".join(rom.name for rom in player.roms) or "NONE"), YELLOW),
        ("", WHITE),
        (f"SEED  {game.seed}", LGRAY),
        ("", WHITE),
        ("PRESS ANY KEY", LGRAY),
    ]
    draw_panel(r, x, y, w, h, title, lines)
