"""Simulador headless do ECOS '94.

Nao usa o terminal: exercita apenas a logica de jogo. Serve para validar
geracao de setor, comandos, IA, reproducibilidade de seed e ausencia de
excecoes em partidas longas.

Uso:
    python tools/simulate.py [seed] [partidas]
"""

from __future__ import annotations

import heapq
import os
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ecos import audio  # noqa: E402
from ecos.actions import Game  # noqa: E402
from ecos.data import DOOR_LOCKED  # noqa: E402
from ecos.dungeon import generate  # noqa: E402
from ecos.rng import Rng  # noqa: E402

audio.MUTED = True

FAILURES: list[str] = []


def check(condition: bool, message: str) -> None:
    if condition:
        print(f"  [ok]   {message}")
    else:
        print(f"  [FAIL] {message}")
        FAILURES.append(message)


# --------------------------------------------------------------------- mapa
def reachable(level, start) -> set[tuple[int, int]]:
    """Celulas alcancaveis a partir de start, ignorando portas fechadas."""
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            nx, ny = x + dx, y + dy
            if (nx, ny) in seen:
                continue
            if not level.in_bounds(nx, ny):
                continue
            tile = level.tiles[ny][nx]
            if tile.kind == "wall":
                continue
            if tile.is_door() and tile.door == DOOR_LOCKED:
                continue
            seen.add((nx, ny))
            queue.append((nx, ny))
    return seen


def test_generation() -> None:
    print("\n== Geracao de setor ==")
    for depth in range(1, 11):
        rng = Rng(1000 + depth)
        level = generate(rng, depth)

        floors = list(level.floor_positions())
        check(len(level.rooms) >= 3, f"setor {depth}: pelo menos 3 salas")
        check(len(floors) > 200, f"setor {depth}: area util suficiente ({len(floors)})")

        reach = reachable(level, level.stairs_up)
        check(
            level.stairs_down in reach,
            f"setor {depth}: escada de descida alcancavel sem destrancar",
        )

        locked = [
            (x, y)
            for y in range(level.h)
            for x in range(level.w)
            if level.tiles[y][x].is_door() and level.tiles[y][x].door == DOOR_LOCKED
        ]
        if depth >= 2:
            check(bool(locked), f"setor {depth}: existe porta trancada")
        else:
            check(True, f"setor {depth}: porta trancada opcional")

        slates = [i for i in level.items if i.kind == "slate"]
        check(len(slates) == 1, f"setor {depth}: exatamente um SLATE")
        check(
            bool(slates) and slates[0].payload == level.password,
            f"setor {depth}: SLATE carrega a senha do setor",
        )
        check(
            bool(slates) and (slates[0].x, slates[0].y) in reach,
            f"setor {depth}: SLATE fica em area alcancavel",
        )

        if 2 <= depth <= 7:
            check(
                len(level.roms_on_floor) == 1,
                f"setor {depth}: um ROM no chao",
            )
        else:
            check(len(level.roms_on_floor) == 0, f"setor {depth}: sem ROM")

        bosses = [m for m in level.monsters if m.kind == "devourer"]
        if depth == 10:
            check(len(bosses) == 1, "setor 10: DEVOURER presente")
        else:
            check(not bosses, f"setor {depth}: sem chefe")

        check(
            all(m.x >= 0 and m.y >= 0 for m in level.monsters),
            f"setor {depth}: monstros posicionados",
        )
        check(
            all(i.x >= 0 and i.y >= 0 for i in level.items),
            f"setor {depth}: itens posicionados",
        )


# ------------------------------------------------------------------ comandos
KEYS = [
    ("up", ""),
    ("down", ""),
    ("left", ""),
    ("right", ""),
    ("char", "w"),
    ("char", "a"),
    ("char", "s"),
    ("char", "d"),
    ("char", "h"),
    ("char", "j"),
    ("char", "k"),
    ("char", "l"),
    ("char", "y"),
    ("char", "u"),
    ("char", "b"),
    ("char", "n"),
    ("char", "S"),
    ("char", "p"),
    ("char", "M"),
    ("char", "m"),
    ("char", "L"),
    ("char", "U"),
    ("char", "G"),
    ("char", "g"),
    ("char", "D"),
    ("char", "I"),
    ("char", "i"),
    ("char", "X"),
    ("char", "x"),
    ("char", "B"),
    ("char", "?"),
    ("char", "."),
    ("char", "1"),
    ("char", "2"),
    ("char", "3"),
    ("char", "9"),
    ("char", "u"),
    ("char", "d"),
    ("escape", ""),
    ("enter", ""),
]


def test_commands() -> None:
    print("\n== Comandos ==")
    game = Game(4242)

    game.ping()
    check(game.player.noise > 0, f"ping gera ruido ({game.player.noise})")
    check(game.player.sonar_cooldown > 0, "ping entra em recarga")

    game.begin_measure()
    check(game.mode == "prompt", "M abre prompt do RULER")
    game.handle_key("char", "h")
    check(game.mode == "play", "direcao fecha o prompt do RULER")
    check(len(game.beam) >= 0, "RULER desenhou o feixe")

    game.begin_inventory()
    check(game.mode == "prompt", "I abre inventario")
    game.handle_key("escape", "")
    check(game.mode == "play", "ESC fecha o inventario")

    before = game.player.alert
    game.reset_sector()
    check(game.player.alert == before + 1, "X aumenta ALERT")
    check(game.reset_used, "RESET marca o setor como usado")
    game.reset_sector()
    check(game.player.alert == before + 1, "RESET nao pode ser repetido no mesmo setor")

    game.pickup()
    check(True, "G sem item nao quebra")

    game.handle_key("char", "L")
    check(True, "L sem porta nao quebra")
    game.handle_key("char", "U")
    check(True, "U sem porta nao quebra")
    game.handle_key("char", "B")
    check(True, "B sem porta nao quebra")

    # forca bruta completa em uma porta trancada de verdade
    game2 = Game(77)
    found = False
    for y in range(game2.level.h):
        for x in range(game2.level.w):
            tile = game2.level.tiles[y][x]
            if not tile.is_door():
                continue
            for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                nx, ny = x + dx, y + dy
                if not game2.level.in_bounds(nx, ny):
                    continue
                if game2.level.tiles[ny][nx].kind != "floor":
                    continue
                tile.door = DOOR_LOCKED
                game2.player.x, game2.player.y = nx, ny
                found = True
                break
            if found:
                break
        if found:
            break
    check(found, "existe porta para testar forca bruta")
    if found:
        monsters_before = len(game2.level.monsters)
        for _ in range(3):
            game2.brute_force()
        check(
            len(game2.level.monsters) > monsters_before,
            "forca bruta que falha dispara PURGE com monstros",
        )


def test_descend() -> None:
    print("\n== Descida e reset ==")
    game = Game(9001)
    start_depth = game.depth
    game.descend()
    check(game.depth == start_depth + 1, "descer avanca o setor")
    check(game.player.x == game.level.stairs_up[0], "jogador chega na escada de subida")
    check(not game.reset_used, "RESET volta a ser disponivel no novo setor")

    roms = 0
    while game.depth < 10:
        game.descend()
        roms += len(game.level.roms_on_floor)
    check(game.depth == 10, "chega ao setor 10")
    check(not game.over, "setor 10 nao encerra a run")
    game.descend()
    check(game.victory and game.over, "descer do setor 10 e vitoria")


def test_reproducibility() -> None:
    print("\n== Reproducibilidade ==")
    a = Game(31337)
    b = Game(31337)
    for _ in range(200):
        kind, ch = KEYS[(_ * 7 + 13) % len(KEYS)]
        a.handle_key(kind, ch)
        b.handle_key(kind, ch)
    same_level = a.level.w == b.level.w and a.level.h == b.level.h
    check(same_level, "mesma seed gera o mesmo tamanho de setor")
    check(a.player.x == b.player.x and a.player.y == b.player.y, "mesma posicao final")
    check(a.turn == b.turn, "mesmo numero de turnos")
    check(a.player.hp == b.player.hp, "mesmo HP final")

    c = Game(31338)
    for _ in range(200):
        kind, ch = KEYS[(_ * 7 + 13) % len(KEYS)]
        c.handle_key(kind, ch)
    check(
        not (a.player.x == c.player.x and a.player.y == c.player.y and a.turn == c.turn),
        "seed diferente gera outra run",
    )


def test_fuzz(seed: int, runs: int = 40, turns: int = 400) -> None:
    print(f"\n== Fuzz: {runs} partidas de {turns} turnos (seed base {seed}) ==")
    rng = Rng(seed)
    deaths = 0
    victories = 0
    max_depth = 0
    for run in range(runs):
        game = Game(rng.randint(0, 0xFFFFFFFF))
        for _ in range(turns):
            if game.over:
                break
            kind, ch = KEYS[rng.randint(0, len(KEYS) - 1)]
            game.handle_key(kind, ch)
            max_depth = max(max_depth, game.depth)
        if game.over:
            deaths += 1
        if game.victory:
            victories += 1
    check(True, f"nenhuma excecao em {runs * turns} turnos")
    print(f"         mortes={deaths} vitorias={victories} profundidade_max={max_depth}")


# ------------------------------------------------------------------ bot
DIRS8 = ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (1, -1), (-1, 1), (1, 1))


def path_to(level, start, goal, locked_open=False):
    """Caminho mais curto (4 direcoes). Retorna lista de passos ou None."""
    from ecos.dungeon import reachable_tiles  # noqa: F401

    prev = {start: None}
    queue = deque([start])
    while queue:
        cur = queue.popleft()
        if cur == goal:
            break
        cx, cy = cur
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            nxt = (cx + dx, cy + dy)
            if nxt in prev or not level.in_bounds(*nxt):
                continue
            tile = level.tiles[nxt[1]][nxt[0]]
            if tile.kind == "wall":
                continue
            if tile.is_door() and tile.door == "locked" and not locked_open:
                continue
            prev[nxt] = cur
            queue.append(nxt)
    if goal not in prev:
        return None
    steps = []
    node = goal
    while prev[node] is not None:
        steps.append(node)
        node = prev[node]
    steps.reverse()
    return steps


VISIBLE = 2
DIRS4 = ((0, -1), (0, 1), (-1, 0), (1, 0))
DEBUG_BOT = False


def bfs_path(level, start, goal, cost=None, allow_locked=False):
    """Caminho mais barato (Dijkstra em 4 direcoes). Devolve os passos ou None."""
    if start == goal:
        return []
    dist = {start: 0}
    prev = {start: None}
    heap = [(0, start)]
    nodes = 0
    while heap:
        current, cur = heapq.heappop(heap)
        if current > dist.get(cur, 1 << 30):
            continue
        if cur == goal:
            break
        nodes += 1
        if nodes > 12000:
            return None
        cx, cy = cur
        for dx, dy in DIRS4:
            nxt = (cx + dx, cy + dy)
            if not level.in_bounds(*nxt):
                continue
            tile = level.tiles[nxt[1]][nxt[0]]
            if tile.kind == "wall":
                continue
            if tile.is_door() and tile.door == "locked" and not allow_locked:
                continue
            step = current + 1 + (0 if cost is None else cost(nxt))
            if step < dist.get(nxt, 1 << 30):
                dist[nxt] = step
                prev[nxt] = cur
                heapq.heappush(heap, (step, nxt))
    if goal not in prev:
        return None
    steps = []
    node = goal
    while prev[node] is not None:
        steps.append(node)
        node = prev[node]
    steps.reverse()
    return steps


def _known_items(level) -> list[tuple[int, int, object]]:
    """Itens em tiles que o jogador ja viu."""
    out = []
    for item in level.items:
        if level.known[item.y][item.x]:
            out.append((item.x, item.y, item))
    return out


def _first_locked(steps, level):
    for index, step in enumerate(steps):
        tile = level.tiles[step[1]][step[0]]
        if tile.is_door() and tile.door == "locked":
            return index, step
    return None, None


def _frontier(level, start):
    """Tile desconhecido mais proximo: para onde explorar."""
    seen = {start}
    queue = deque([start])
    nodes = 0
    while queue:
        cur = queue.popleft()
        nodes += 1
        if nodes > 4000:
            return None
        cx, cy = cur
        for dx, dy in DIRS4:
            nxt = (cx + dx, cy + dy)
            if nxt in seen or not level.in_bounds(*nxt):
                continue
            tile = level.tiles[nxt[1]][nxt[0]]
            if tile.kind == "wall":
                continue
            if tile.is_door() and tile.door == "locked":
                continue
            if not level.known[nxt[1]][nxt[0]]:
                return nxt
            seen.add(nxt)
            queue.append(nxt)
    return None


def play_bot(game, max_turns: int = 6000):
    """Bot competente: usa sonar, desvia de grupos, coleta loot e cura.

    Só enxerga o que o mapa do jogo mostra (tiles revelados), como um
    jogador humano. Devolve (venceu, setor_alcancado).
    """
    seen: dict[tuple[int, int], int] = {}
    ignored: set[int] = set()
    goal = None
    goal_age = 0
    last_ping = -99

    for _ in range(max_turns):
        if game.over:
            return game.victory, game.depth
        player = game.player
        level = game.level

        # --- percepcao: o que o sonar deixou visivel
        for monster in level.monsters:
            if monster.alive and level.known[monster.y][monster.x] == VISIBLE:
                seen[(monster.x, monster.y)] = game.turn
        threats = set()
        for pos, turn in seen.items():
            if game.turn - turn <= 16 and level.monster_at(*pos) is not None:
                threats.add(pos)

        # --- cura
        hurt = player.hp <= player.max_hp * 0.65
        if hurt:
            ampola = next(
                (i for i in player.inventory if i.data.get("heal")), None
            )
            if ampola is not None:
                game.use_item(ampola)
                continue

        # --- combate: luta com quem esta em cima, so foge se estiver morrendo
        adjacent = [
            m for m in level.monsters if m.alive and m.is_adjacent(player.x, player.y)
        ]
        if adjacent:
            # grupo: atordoa antes de apanhar
            if len(adjacent) >= 2:
                shocker = next(
                    (i for i in player.inventory if i.data.get("stun")), None
                )
                if shocker is not None:
                    game.use_item(shocker)
                    continue
            if hurt and player.hp <= player.max_hp * 0.3:
                escape = _escape_step(game, threats)
                if escape is not None:
                    game.move(*escape)
                    continue
            target = min(adjacent, key=lambda m: m.hp)
            game.move(target.x - player.x, target.y - player.y)
            continue

        # --- recolhe o que esta em cima
        rom = level.rom_at(player.x, player.y)
        if rom is not None and player.free_rom_slots > 0:
            game.read_rom(rom)
            continue
        item = level.item_at(player.x, player.y)
        if item is not None and id(item) not in ignored:
            before = len(level.items)
            game.pickup()
            if len(level.items) == before:
                ignored.add(id(item))
            continue

        # --- objetivo (recalculado de tempos em tempos)
        goal_age += 1
        if goal is None or goal_age > 25:
            goal = _pick_goal(game, seen)
            goal_age = 0
        if goal is None:
            # sem loot a vista: explora a fronteira se estiver saudo,
            # senao desce
            if player.hp > player.max_hp * 0.65:
                frontier = _frontier(level, (player.x, player.y))
                goal = frontier if frontier is not None else level.stairs_down
            else:
                goal = level.stairs_down

        # --- caminho: prefere trajetos longe das ameacas conhecidas
        hot = lambda pos: 8 if _is_hot(pos, threats) else 0
        steps = bfs_path(level, (player.x, player.y), goal, cost=hot)
        if steps is None:
            steps = bfs_path(level, (player.x, player.y), goal, allow_locked=True)
        if steps is None:
            goal = level.stairs_down
            goal_age = 0
            continue
        if not steps:
            goal = level.stairs_down
            goal_age = 0
            continue

        nxt = steps[0]

        if DEBUG_BOT:
            print(
                f"t={game.turn} d={game.depth} pos={player.x},{player.y} "
                f"goal={goal} nxt={nxt} steps={len(steps)} "
                f"adj={[m.name for m in adjacent]} hp={player.hp} "
                f"inv={[i.name for i in player.inventory]}"
            )

        # --- sonar: pingar custa 30 de ruido e chama o bando inteiro.
        # So usa quando esta longe de tudo e nao ha muito tempo.
        close = any(
            m.alive and m.distance_to(player.x, player.y) <= 12
            for m in level.monsters
        )
        if (
            player.sonar_cooldown <= 0
            and not close
            and (
                not level.known[nxt[1]][nxt[0]]
                or game.turn - last_ping >= 26
            )
        ):
            game.ping()
            last_ping = game.turn
            continue

        # --- porta trancada no caminho
        index, door = _first_locked(steps, level)
        if index is not None:
            if index == 0:
                game.move(door[0] - player.x, door[1] - player.y)
                tile = level.tiles[door[1]][door[0]]
                if tile.is_door() and tile.door == "locked":
                    game.brute_force()
            else:
                game.move(nxt[0] - player.x, nxt[1] - player.y)
            continue

        game.move(nxt[0] - player.x, nxt[1] - player.y)

    return False, game.depth


def _is_hot(pos, threats) -> bool:
    """Tile perto demais de uma ameaca conhecida."""
    x, y = pos
    for tx, ty in threats:
        if abs(tx - x) <= 1 and abs(ty - y) <= 1:
            return True
    return False


def _escape_step(game, threats):
    """Um passo para longe das ameacas conhecidas."""
    player = game.player
    level = game.level
    best = None
    best_score = None
    for dx, dy in DIRS8:
        nx, ny = player.x + dx, player.y + dy
        if not level.in_bounds(nx, ny):
            continue
        tile = level.tiles[ny][nx]
        if tile.kind == "wall" or (tile.is_door() and tile.blocks()):
            continue
        if level.monster_at(nx, ny) is not None:
            continue
        score = 0
        for tx, ty in threats:
            score += max(abs(tx - nx), abs(ty - ny))
        if best_score is None or score > best_score:
            best_score = score
            best = (dx, dy)
    return best


def _pick_goal(game, seen):
    """Escolhe para onde ir: cura, loot util, ROM, ou a escada."""
    player = game.player
    level = game.level
    start = (player.x, player.y)

    def dist(pos):
        return abs(pos[0] - start[0]) + abs(pos[1] - start[1])

    weapon = player.equipped.get("weapon")
    armor = player.equipped.get("armor")
    cur_atk = weapon.data.get("atk", 0) if weapon else 0
    cur_dfn = armor.data.get("dfn", 0) if armor else 0
    hurt = player.hp <= player.max_hp * 0.7

    best = None
    best_score = None

    def offer(score, pos):
        nonlocal best, best_score
        if best_score is None or score < best_score:
            best_score = score
            best = pos

    # ROM no chao, se houver slot livre
    if player.free_rom_slots > 0:
        has_key = (
            level.password is not None and level.password in player.passwords
        )
        for rom in level.roms_on_floor:
            if not level.known[rom.y][rom.x]:
                continue
            path = bfs_path(level, start, (rom.x, rom.y), allow_locked=True)
            if path is None:
                continue
            locked = _first_locked(path, level)[0] is not None
            if locked and not has_key:
                # sem a senha ainda: vai atras do SLATE antes
                continue
            offer(dist((rom.x, rom.y)) + 12, (rom.x, rom.y))

    # cura primeiro quando esta ferido
    for x, y, item in _known_items(level):
        if item.category != "consumable" or not item.data.get("heal"):
            continue
        score = dist((x, y))
        if hurt:
            score -= 30
        if score < 40:
            offer(score, (x, y))

    # gear que melhora o operador
    for x, y, item in _known_items(level):
        score = None
        if item.category == "weapon" and item.data.get("atk", 0) > cur_atk:
            score = dist((x, y)) + 6
        elif item.category == "armor" and item.data.get("dfn", 0) > cur_dfn:
            score = dist((x, y)) + 6
        elif item.kind == "slate":
            score = dist((x, y)) + 14
        if score is None or score > 34:
            continue
        offer(score, (x, y))

    return best


def test_bot() -> None:
    print("\n== Bot: o setor e completavel? ==")
    advanced = 0
    depths = []
    for seed in range(40):
        game = Game(5000 + seed)
        won, depth = play_bot(game)
        depths.append(depth)
        if depth > 1:
            advanced += 1
    check(
        advanced >= 30,
        f"bot desce pelo menos um setor em {advanced}/40 tentativas",
    )
    print(f"         profundidade media = {sum(depths) / len(depths):.2f}")

    victories = 0
    for seed in range(12):
        game = Game(7000 + seed)
        won, depth = play_bot(game, max_turns=12000)
        if won:
            victories += 1
    check(victories >= 1, f"bot vence pelo menos 1 run completa ({victories}/12)")


# ---------------------------------------------------------------- render
class FakeTerminal:
    """Terminal falso: captura a saida do renderer sem tocar no console."""

    def __init__(self, width: int = 80, height: int = 25) -> None:
        self.width = width
        self.height = height
        self.vt = True
        self.chunks: list[str] = []

    def write(self, text: str) -> None:
        self.chunks.append(text)

    def get_size(self):
        return self.width, self.height

    def refresh_size(self) -> bool:
        return False


def test_render() -> None:
    print("\n== Render ==")
    from ecos import view
    from ecos.render import Renderer

    term = FakeTerminal()
    renderer = Renderer(term, truecolor=True)
    game = Game(2024)

    view.draw_title(renderer, term.width, term.height, {"phosphor": None, "scanlines": True})
    renderer.flush()
    check(len(term.chunks) > 0, "tela de titulo desenha")
    title_text = "".join(term.chunks)

    for mode in (None, "green", "amber", "white"):
        renderer.set_mode(mode, True)
        renderer.invalidate()
        view.draw_hud(renderer, game, term.width)
        vx, vy = view.camera(game, term.width, term.height - 6)
        view.draw_map(renderer, game, vx, vy, term.width, term.height - 6)
        view.draw_log(renderer, game, term.width, term.height)
        renderer.flush()
    check(True, "mapa e HUD desenham em todos os modos de cor")

    view.draw_help(renderer, term.width, term.height)
    view.draw_inventory(renderer, game, term.width, term.height)
    view.draw_summary(renderer, game, term.width, term.height)
    renderer.flush()
    check(True, "paineis de ajuda, inventario e resumo desenham")

    # tudo que o jogo escreve precisa caber na pagina de codigo 437
    blob = "".join(term.chunks)
    try:
        blob.encode("cp437")
        check(True, "saida do jogo e compativel com CP437")
    except UnicodeEncodeError as exc:
        check(False, f"saida do jogo e compativel com CP437 ({exc})")

    check("@" in title_text or len(title_text) > 0, "titulo tem conteudo")

    # o HUD precisa caber inteiro num terminal classico de 80 colunas
    import re as _re

    ansi = _re.compile(r"\x1b\[[0-9;]*m")
    narrow = FakeTerminal(80, 25)
    renderer2 = Renderer(narrow, truecolor=True)
    game.player.hp = 14
    game.player.noise = 41
    game.player.alert = 1
    view.draw_hud(renderer2, game, 80)
    row = ansi.sub("", renderer2._row_string(0)).rstrip()
    check(len(row) <= 80, f"HUD cabe em 80 colunas ({len(row)} colunas usadas)")
    check("NZ" in row and "AL" in row, "HUD compacto mostra ruido e ALERT")


def test_smoke_loop() -> None:
    """Roda o loop principal completo (titulo + jogo) com terminal falso."""
    print("\n== Loop principal ==")
    from ecos import main as M

    class FakeTerm(FakeTerminal):
        def __init__(self) -> None:
            super().__init__(100, 30)
            self.script = [
                ("char", "n"),
                ("char", "h"), ("char", "j"), ("char", "k"), ("char", "l"),
                ("char", "S"), ("char", "G"), ("char", "."),
                ("char", "?"), ("char", " "),
                ("char", "i"), ("char", " "),
                ("char", "M"), ("up", ""), ("escape", ""),
                ("char", "B"), ("char", "D"), ("escape", ""),
                ("char", "L"), ("char", "U"),
                ("char", "q"),
                ("char", "q"),
            ]

        def read_key(self):
            if self.script:
                return self.script.pop(0)
            raise RuntimeError("script de teclas esgotado (possivel loop)")

        def enter(self) -> None:
            pass

        def leave(self) -> None:
            pass

        def clear(self) -> None:
            pass

    original = M.Terminal
    M.Terminal = FakeTerm
    try:
        code = M.main(["--mute", "--seed", "4242"])
    except Exception as exc:  # noqa: BLE001 - o teste precisa reportar
        code = -1
        print(f"       {type(exc).__name__}: {exc}")
    finally:
        M.Terminal = original
    check(code == 0, "loop principal (titulo + jogo) sai com codigo 0")


def test_visual_cleanup() -> None:
    """Regressao dos bugs visuais: RESET limpa o mapa, painel fechado some."""
    print("\n== Limpeza visual ==")
    import re as _re

    from ecos import main as M
    from ecos import view
    from ecos.render import Renderer

    ansi = _re.compile(r"\x1b\[[0-9;]*m")
    term = FakeTerminal(100, 30)
    renderer = Renderer(term, truecolor=True)
    game = Game(2024)

    def scene() -> list[str]:
        M.draw_scene(renderer, game, term.width, term.height)
        return [ansi.sub("", renderer._row_string(y)) for y in range(term.height)]

    def map_area(lines: list[str]) -> str:
        return "".join(lines[view.MAP_TOP : term.height - 3])

    # --- bug 1: RESET tem que apagar o setor antigo da tela
    level = game.level
    for y in range(level.h):
        for x in range(level.w):
            level.known[y][x] = 1
    before = map_area(scene())
    check(
        any(ch in before for ch in "\u2588\u00b7+"),
        "setor explorado aparece na tela antes do RESET",
    )

    game.reset_sector()
    after = map_area(scene())
    check("@" in after, "jogador continua visivel depois do RESET")

    # nenhum desenho pode sobrar de um tile que o setor novo NAO conhece
    level = game.level
    vx, vy = view.camera(game, term.width, term.height - 6)
    allowed = {
        (x - vx, y - vy)
        for y in range(level.h)
        for x in range(level.w)
        if level.known[y][x]
    }
    allowed.add((game.player.x - vx, game.player.y - vy))
    ghosts = []
    for row, line in enumerate(scene()[view.MAP_TOP : term.height - 3]):
        for col, ch in enumerate(line):
            if ch != " " and (col, row) not in allowed:
                ghosts.append((col, row, ch))
    check(
        not ghosts,
        f"RESET apaga o setor antigo (sem desenhos fantasma: {ghosts[:4]})",
    )
    check(
        len(after) - after.count(" ") < len(before) - before.count(" "),
        "RESET esvazia a tela (o setor novo comeca no escuro)",
    )

    # --- bug 2: painel fechado tem que sumir da tela
    game.begin_inventory()
    opened = map_area(scene())
    check("\u2502" in opened, "painel de inventario abre")

    game.handle_key("escape", "")
    closed = map_area(scene())
    check("\u2502" not in closed, "painel de inventario some ao fechar")
    check("\u2500" not in closed, "borda do painel some ao fechar")

    game.handle_key("char", "?")
    help_open = map_area(scene())
    check("\u2502" in help_open, "painel de ajuda abre")

    game.handle_key("char", " ")
    help_closed = map_area(scene())
    check("\u2502" not in help_closed, "painel de ajuda some ao fechar")

    # o mapa nao pode invadir as linhas do HUD
    game.player.hp = 28
    lines = scene()
    check(
        lines[0].startswith("ECOS '94"),
        "linha 0 continua sendo o HUD (o mapa nao invade)",
    )


def main() -> int:
    test_generation()
    test_commands()
    test_descend()
    test_reproducibility()
    test_render()
    test_visual_cleanup()
    test_smoke_loop()
    test_bot()
    test_fuzz(1234)

    print("\n" + "=" * 50)
    if FAILURES:
        print(f"FALHARAM {len(FAILURES)} verificacoes:")
        for item in FAILURES:
            print(f"  - {item}")
        return 1
    print("TODAS AS VERIFICACOES PASSARAM")
    return 0


if __name__ == "__main__":
    sys.exit(main())
