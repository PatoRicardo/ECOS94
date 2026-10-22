"""Estado do jogo e acoes do jogador.

Game guarda o estado completo de uma run (jogador, setor, turno, log) e
expone um unico ponto de entrada para o terminal: handle_key().
"""

from __future__ import annotations

from . import ai, audio, dungeon, sonar, status
from .data import (
    DOOR_CLOSED,
    DOOR_LOCKED,
    DOOR_OPEN,
    MAX_DEPTH,
    NOISE,
    NOISE_DECAY,
    NOISE_MAX,
    PERSONAL_RADIUS,
    ROM_SLOTS,
    SONAR_COOLDOWN,
)
from .entities import Item, Player
from .render import (
    LGREEN,
    LRED,
    LCYAN,
    RED,
    WHITE,
    YELLOW,
)
from .rng import Rng

DIRS8 = ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (1, -1), (-1, 1), (1, 1))

# Direcao vem SO das setas do teclado (kind devolvido pelo terminal).
# WASD, hjkl, vi-keys e numpad nao movem mais: as letras ficam
# exclusivamente para os comandos, sem conflito entre eles.
DIR_BY_KEY = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}

MAX_BEAM = 30


class Game:
    def __init__(self, seed: int, phosphor: str | None = None, scanlines: bool = True) -> None:
        self.seed = int(seed) & 0xFFFFFFFF
        self.rng = Rng(self.seed)
        self.player = Player()
        # Kit de campo: uma faca e o RULER. Sem isso o operador comeca
        # desarmado e a primeira sala mata.
        starter_weapon = Item("dagger")
        self.player.equipped["weapon"] = starter_weapon
        self.player.inventory.append(Item("ruler"))
        self.level = None
        self.depth = 1
        self.turn = 0
        self.messages: list[tuple[str, int]] = []
        self.over = False
        self.victory = False
        self.cause = ""
        self.last_hit_by = ""
        self.noise_source: tuple[int, int] | None = None
        self.beam: list[tuple[int, int]] = []
        self.beam_turn = -1
        self.reset_used = False
        self.mode = "play"
        self.prompt: dict | None = None
        self.phosphor = phosphor
        self.scanlines = scanlines
        self._level_counter = 0
        self.msg("ECOS SYSTEM ONLINE.")
        self.enter_level(1, first=True)

    # ------------------------------------------------------------- mensagens
    def msg(self, text: str, color: int = WHITE) -> None:
        self.messages.append((text, color))
        if len(self.messages) > 80:
            del self.messages[0]

    # ---------------------------------------------------------------- setor
    def _generate_level(self, depth: int):
        self._level_counter += 1
        lvl_rng = self.rng.fork(f"lvl{self._level_counter}:{depth}")
        return dungeon.generate(lvl_rng, depth)

    def enter_level(self, depth: int, first: bool = False) -> None:
        self.depth = depth
        self.player.depth = depth
        self.level = self._generate_level(depth)
        self.player.x, self.player.y = self.level.stairs_up
        self.reset_used = False
        self.beam = []
        sonar.reveal_circle(self.level, self.player.x, self.player.y, PERSONAL_RADIUS, self.turn)
        if self.player.diagnostic:
            sonar.reveal_all(self.level, self.turn)
            self.msg("DIAGNOSTIC ROM REVEALS THE SECTOR LAYOUT.", LCYAN)
        if not first:
            self.msg(f"YOU DESCEND TO SECTOR {depth}.", LGREEN)

    def descend(self) -> None:
        if self.depth >= MAX_DEPTH:
            self.victory = True
            self.over = True
            self.cause = "THE DEVOURER IS SILENT. ECOS IS YOURS."
            return
        self.enter_level(self.depth + 1)

    # --------------------------------------------------------------- ruido
    def add_noise(self, amount: int, source) -> None:
        if amount <= 0:
            return
        player = self.player
        player.noise = min(NOISE_MAX, player.noise + amount)
        player.peak_noise = max(player.peak_noise, player.noise)
        if source is not None:
            self.noise_source = (source[0], source[1])

    # ---------------------------------------------------------------- turno
    def end_turn(self) -> None:
        if self.over:
            return
        self.turn += 1
        player = self.player
        player.turns += 1
        if player.sonar_cooldown > 0:
            player.sonar_cooldown -= 1

        for line, color in ai.run_monsters(self):
            self.msg(line, color)

        player.noise = max(0, player.noise - NOISE_DECAY)
        player.peak_noise = max(player.peak_noise, player.noise)

        sonar.fade(self.level, self.turn, player.memory_persists)
        sonar.reveal_circle(
            self.level, player.x, player.y, PERSONAL_RADIUS, self.turn
        )

        if player.hp <= 0:
            player.hp = 0
            self.over = True
            if not self.cause:
                self.cause = f"TAKEN BY THE {self.last_hit_by or 'DARK'}"

    # ------------------------------------------------------------- comandos
    def handle_key(self, kind: str, ch: str) -> str:
        """Processa uma tecla. Retorna 'ok' | 'title' | 'quit'."""
        if self.mode == "inventory":
            self.mode = "play"
            return "ok"
        if self.mode == "help":
            self.mode = "play"
            return "ok"
        if self.mode == "prompt":
            return self._handle_prompt(kind, ch)

        if kind in DIR_BY_KEY:
            self.move(*DIR_BY_KEY[kind])
            return "ok"

        if kind != "char" or not ch:
            return "ok"

        # O movimento e so pelas setas, entao nenhuma letra disputa tecla
        # com ele: cada comando aceita MAIUSCULA e minuscula.
        lower = ch.lower()
        if lower in ("s", "p"):
            self.ping()
        elif lower == "m":
            self.begin_measure()
        elif lower == "l":
            self.lock_door()
        elif lower == "u":
            self.unlock_door()
        elif lower == "g":
            self.pickup()
        elif lower == "d":
            self.begin_drop()
        elif lower == "i":
            self.begin_inventory()
        elif lower == "x":
            self.reset_sector()
        elif lower == "b":
            self.brute_force()
        elif lower == "q":
            return "title"
        elif ch == "?":
            self.mode = "help"
        elif ch == ".":
            self.wait()
        return "ok"

    # ------------------------------------------------------------- movimento
    def move(self, dx: int, dy: int) -> None:
        player = self.player
        nx, ny = player.x + dx, player.y + dy
        if not self.level.in_bounds(nx, ny):
            return
        monster = self.level.monster_at(nx, ny)
        if monster is not None:
            self.player_attack(monster)
            self.end_turn()
            return
        tile = self.level.tiles[ny][nx]
        if tile.blocks():
            if tile.is_door():
                if tile.door == DOOR_CLOSED:
                    tile.door = DOOR_OPEN
                    self.add_noise(NOISE["lock"], (nx, ny))
                    self.msg("YOU OPEN THE DOOR.")
                    self.end_turn()
                else:
                    if self.level.password and self.level.password in player.passwords:
                        tile.door = DOOR_OPEN
                        self.add_noise(NOISE["lock"], (nx, ny))
                        self.msg(f"SLATE ACCEPTED: {self.level.password}.", LGREEN)
                        self.end_turn()
                    else:
                        self.msg("THE DOOR IS LOCKED. [B] FORCES IT.", LRED)
            return
        player.x, player.y = nx, ny
        self.add_noise(status.step_noise(player, self.level), (nx, ny))
        if (nx, ny) == self.level.stairs_down:
            self.descend()
        self.end_turn()

    def wait(self) -> None:
        self.msg("YOU WAIT.")
        self.end_turn()

    def player_attack(self, monster) -> None:
        damage, crit = status.damage_to_monster(self.player, monster, self.rng)
        monster.hp -= damage
        self.add_noise(NOISE["combat"], (self.player.x, self.player.y))
        if crit:
            self.msg(f"CRITICAL! {monster.name} TAKES {damage}.", YELLOW)
        else:
            self.msg(f"YOU HIT {monster.name} FOR {damage}.")
        audio.hit()
        if monster.hp <= 0:
            monster.alive = False
            self.player.kills += 1
            self.msg(f"{monster.name} IS DESTROYED.", LGREEN)

    # ---------------------------------------------------------------- sonar
    def ping(self) -> None:
        player = self.player
        if player.sonar_cooldown > 0:
            self.msg(f"SONAR RECHARGING ({player.sonar_cooldown} TURNS).", LRED)
            return
        radius = status.sonar_radius(player)
        sonar.reveal_circle(self.level, player.x, player.y, radius, self.turn)
        amount = status.ping_noise(player)
        self.add_noise(amount, (player.x, player.y))
        player.sonar_cooldown = SONAR_COOLDOWN
        self.msg(f"SONAR PING. RADIUS {radius}. NOISE +{amount}.", LCYAN)
        audio.ping()

    # ---------------------------------------------------------------- ruler
    def begin_measure(self) -> None:
        if not self.player.has_ruler:
            self.msg("YOU CARRY NO RULER.", LRED)
            return
        self.mode = "prompt"
        self.prompt = {"kind": "measure"}

    def measure(self, dx: int, dy: int) -> None:
        player = self.player
        distance, cells = sonar.reveal_ray(
            self.level, player.x, player.y, dx, dy, MAX_BEAM, self.turn
        )
        self.beam = cells
        self.beam_turn = self.turn
        self.add_noise(NOISE["ruler"], (player.x, player.y))
        self.msg(f"RULER READS {distance} TILES.", LCYAN)
        audio.blip()
        self.end_turn()

    # ---------------------------------------------------------------- portas
    def _adjacent_door(self, want: str | None = None, avoid: str | None = None):
        """Porta vizinha, filtrando pelo estado.

        Sem filtro devolve a primeira porta que encontrar. Com want/avoid
        devolve a primeira porta no estado pedido - sem isso, estar ao lado
        de uma porta aberta e de uma trancada fazia U e B falharem.
        """
        player = self.player
        for dx, dy in DIRS8:
            tile = self.level.tile(player.x + dx, player.y + dy)
            if tile is None or not tile.is_door():
                continue
            if want is not None and tile.door != want:
                continue
            if avoid is not None and tile.door == avoid:
                continue
            return tile
        return None

    def lock_door(self) -> None:
        if self._adjacent_door() is None:
            self.msg("NO DOOR BESIDE YOU.")
            return
        tile = self._adjacent_door(avoid=DOOR_LOCKED)
        if tile is None:
            self.msg("EVERY DOOR BESIDE YOU IS ALREADY LOCKED.")
            return
        tile.door = DOOR_LOCKED
        self.add_noise(NOISE["lock"], (self.player.x, self.player.y))
        self.msg("YOU LOCK THE DOOR.")
        audio.door()
        self.end_turn()

    def unlock_door(self) -> None:
        tile = self._adjacent_door(want=DOOR_LOCKED)
        if tile is None:
            self.msg("NO LOCKED DOOR BESIDE YOU.")
            return
        tile.door = DOOR_OPEN
        if self.player.kernel:
            self.msg("KERNEL UNLOCKS IT SILENTLY.", LGREEN)
        else:
            self.add_noise(NOISE["unlock"], (self.player.x, self.player.y))
            self.msg("YOU UNLOCK THE DOOR.")
            audio.door()
        self.end_turn()

    def brute_force(self) -> None:
        tile = self._adjacent_door(want=DOOR_LOCKED)
        if tile is None:
            self.msg("NO LOCKED DOOR BESIDE YOU.")
            return
        tile.brute += 1
        self.add_noise(NOISE["brute"], (self.player.x, self.player.y))
        if tile.brute >= 3:
            self.add_noise(NOISE["purge"], (self.player.x, self.player.y))
            self.msg("SYSTEM PURGE! THE DOOR EXPLODES.", LRED)
            tile.door = DOOR_OPEN
            tile.brute = 0
            self._spawn_purge_monsters()
        else:
            self.msg(f"THE DOOR HOLDS. ATTEMPT {tile.brute} OF 3.", LRED)
        audio.error()
        self.end_turn()

    def _spawn_purge_monsters(self) -> None:
        from .entities import Monster

        for _ in range(2):
            kind = self.rng.choice(["rat", "bat", "goblin"])
            monster = Monster(kind, self.depth, self.rng)
            spots = [
                (self.player.x + dx, self.player.y + dy)
                for dx, dy in DIRS8
                if self.level.in_bounds(self.player.x + dx, self.player.y + dy)
                and self.level.is_passable(self.player.x + dx, self.player.y + dy)
            ]
            if not spots:
                continue
            monster.x, monster.y = self.rng.choice(spots)
            self.level.monsters.append(monster)

    # ------------------------------------------------------------------ itens
    def pickup(self) -> None:
        player = self.player
        rom = self.level.rom_at(player.x, player.y)
        if rom is not None:
            self.read_rom(rom)
            return
        item = self.level.item_at(player.x, player.y)
        if item is None:
            self.msg("NOTHING TO TAKE HERE.")
            return
        if player.load + item.kg > player.capacity:
            self.msg("TOO HEAVY. LOSE SOMETHING FIRST.", LRED)
            return
        self.level.items.remove(item)
        if item.category == "weapon":
            current = player.equipped["weapon"]
            if current is None or item.data.get("atk", 0) > current.data.get("atk", 0):
                if current is not None:
                    player.inventory.append(current)
                player.equipped["weapon"] = item
                self.msg(f"YOU EQUIP THE {item.name}.", LGREEN)
            else:
                player.inventory.append(item)
                self.msg(f"YOU TAKE THE {item.name}.")
        elif item.category == "armor":
            current = player.equipped["armor"]
            if current is None or item.data.get("dfn", 0) > current.data.get("dfn", 0):
                if current is not None:
                    player.inventory.append(current)
                player.equipped["armor"] = item
                self.msg(f"YOU EQUIP THE {item.name}.", LGREEN)
            else:
                player.inventory.append(item)
                self.msg(f"YOU TAKE THE {item.name}.")
        else:
            player.inventory.append(item)
            self.msg(f"YOU TAKE THE {item.name}.")
        audio.pickup()
        self.end_turn()

    def begin_drop(self) -> None:
        if not self.player.inventory:
            self.msg("YOU CARRY NOTHING.")
            return
        self.mode = "prompt"
        self.prompt = {"kind": "panel", "action": "drop", "items": list(self.player.inventory)}

    def begin_inventory(self) -> None:
        if not self.player.inventory and not self.player.roms:
            self.msg("YOU CARRY NOTHING.")
            return
        self.mode = "prompt"
        self.prompt = {
            "kind": "panel",
            "action": "menu",
            "items": list(self.player.inventory),
        }

    def begin_use(self) -> None:
        usable = [i for i in self.player.inventory if i.category == "consumable"]
        if not usable:
            self.msg("NOTHING USABLE.")
            return
        self.mode = "prompt"
        self.prompt = {"kind": "panel", "action": "use", "items": usable}

    def drop_item(self, item: Item) -> None:
        player = self.player
        if item in player.inventory:
            player.inventory.remove(item)
        item.x, item.y = player.x, player.y
        self.level.items.append(item)
        self.msg(f"YOU DROP THE {item.name}.")
        self.end_turn()

    def use_item(self, item: Item) -> None:
        player = self.player
        data = item.data
        if item.category != "consumable":
            # RULER, armas e armaduras nao se usam: nao podem ser gastas.
            self.msg(f"THE {item.name} CANNOT BE USED.")
            return
        if data.get("heal"):
            player.hp = min(player.max_hp, player.hp + data["heal"])
            self.msg(f"THE {item.name} HEALS {data['heal']} HP.", LGREEN)
        if data.get("noise"):
            amount = data["noise"]
            player.noise = max(0, player.noise + amount)
            self.msg(f"THE {item.name} SHIFTS NOISE BY {amount}.")
        if data.get("stun"):
            radius = data["stun"]
            count = 0
            for monster in self.level.monsters:
                if monster.alive and monster.distance_to(player.x, player.y) <= radius:
                    monster.stun = 3
                    count += 1
            self.add_noise(data.get("noise", 0), (player.x, player.y))
            self.msg(f"THE {item.name} STUNS {count} THING(S).", LCYAN)
        if item in player.inventory:
            player.inventory.remove(item)
        self.end_turn()

    # ------------------------------------------------------------------- ROM
    def read_rom(self, rom) -> None:
        player = self.player
        if player.free_rom_slots <= 0:
            self.mode = "prompt"
            self.prompt = {"kind": "panel", "action": "rom", "items": list(player.roms), "rom": rom}
            self.msg("NO FREE ROM SLOT. CHOOSE ONE TO OVERWRITE.", LRED)
            return
        self._install_rom(rom)

    def _install_rom(self, rom) -> None:
        player = self.player
        if rom in self.level.roms_on_floor:
            self.level.roms_on_floor.remove(rom)
        player.roms.append(rom)
        status.apply_rom(player, rom)
        self.msg(f"ROM {rom.name} READ. {rom.desc}.", YELLOW)
        audio.pickup()
        self.end_turn()

    def overwrite_rom(self, old, new) -> None:
        player = self.player
        if old in player.roms:
            player.roms.remove(old)
        self._install_rom(new)

    # ------------------------------------------------------------------ reset
    def reset_sector(self) -> None:
        if self.reset_used:
            self.msg("RESET ALREADY USED IN THIS SECTOR.", LRED)
            return
        self.reset_used = True
        self.player.alert += 1
        self.player.resets += 1
        self.level = self._generate_level(self.depth)
        self.player.x, self.player.y = self.level.stairs_up
        self.beam = []
        self.msg(
            f"RESET. SECTOR REGENERATED. ALERT IS NOW {self.player.alert}.", LRED
        )
        audio.error()
        self.end_turn()

    # ---------------------------------------------------------------- prompt
    def _handle_prompt(self, kind: str, ch: str) -> str:
        prompt = self.prompt or {}
        pk = prompt.get("kind")
        if pk == "measure":
            if kind == "escape":
                self.mode = "play"
                self.prompt = None
                return "ok"
            delta = DIR_BY_KEY.get(kind)
            if delta:
                self.mode = "play"
                self.prompt = None
                self.measure(*delta)
            return "ok"
        if pk == "panel":
            action = prompt.get("action")
            if kind == "escape":
                self.mode = "play"
                self.prompt = None
                self.msg("CANCELLED.")
                return "ok"
            if kind == "char" and ch.isdigit():
                index = int(ch) - 1
                items = prompt.get("items", [])
                if 0 <= index < len(items):
                    item = items[index]
                    if action == "drop":
                        self.mode = "play"
                        self.prompt = None
                        self.drop_item(item)
                    elif action == "use":
                        self.mode = "play"
                        self.prompt = None
                        self.use_item(item)
                    elif action == "rom":
                        self.mode = "play"
                        self.prompt = None
                        self.overwrite_rom(item, prompt["rom"])
                    elif action == "menu":
                        self.prompt = {
                            "kind": "panel",
                            "action": "itemmenu",
                            "items": items,
                            "selected": item,
                        }
                        if item.category == "consumable":
                            self.msg(f"{item.name} SELECTED. [U] USE  [D] DROP  [ESC] BACK.")
                        else:
                            self.msg(f"{item.name} SELECTED. [D] DROP  [ESC] BACK.")
                return "ok"
            if action == "itemmenu" and kind == "char":
                selected = prompt.get("selected")
                if ch in ("u", "U"):
                    self.mode = "play"
                    self.prompt = None
                    self.use_item(selected)
                elif ch in ("d", "D"):
                    self.mode = "play"
                    self.prompt = None
                    self.drop_item(selected)
                else:
                    self.prompt = {
                        "kind": "panel",
                        "action": "menu",
                        "items": prompt.get("items", []),
                    }
                return "ok"
        self.mode = "play"
        self.prompt = None
        return "ok"
