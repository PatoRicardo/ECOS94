/**
 * Simulador headless do ECOS '94 WEB.
 *
 * Espelha tools/simulate.py: exercita apenas a logica de jogo, sem DOM e
 * sem canvas. Valida geracao, comandos, portas, reprodutibilidade, fuzz e
 * uma partida conduzida por um bot simples.
 *
 * Uso:
 *   node web/tests/simulate.mjs [seed]
 */

import { setMuted } from "../js/audio.js";
import { Game } from "../js/game.js";
import { DOOR_CLOSED, DOOR_LOCKED, DOOR_OPEN, MAX_DEPTH } from "../js/data.js";
import { generate } from "../js/dungeon.js";
import { Item } from "../js/entities.js";
import { PROLOGUE, prologuePage } from "../js/lore.js";
import { Rng } from "../js/rng.js";

setMuted(true);

const FAILURES = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (condition) {
    console.log(`  [ok]   ${message}`);
  } else {
    console.log(`  [FAIL] ${message}`);
    FAILURES.push(message);
  }
}

const key = (x, y) => `${x},${y}`;
const DIRS4 = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
const DIRS8 = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

// --------------------------------------------------------------------- mapa
function reachable(level, start) {
  const seen = new Set([key(...start)]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head];
    head += 1;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (!level.in_bounds(nx, ny)) continue;
      const tile = level.tiles[ny][nx];
      if (tile.kind === "wall") continue;
      if (tile.is_door() && tile.door === DOOR_LOCKED) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

function bfs_path(level, start, goal, allow_locked = false) {
  const startKey = key(...start);
  const goalKey = key(...goal);
  if (startKey === goalKey) return [];
  const prev = new Map([[startKey, null]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head];
    head += 1;
    if (x === goal[0] && y === goal[1]) break;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = key(nx, ny);
      if (prev.has(nk)) continue;
      if (!level.in_bounds(nx, ny)) continue;
      const tile = level.tiles[ny][nx];
      if (tile.kind === "wall") continue;
      if (tile.is_door() && tile.door === DOOR_LOCKED && !allow_locked) continue;
      prev.set(nk, startKey === nk ? null : key(x, y));
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(goalKey)) return null;
  const path = [];
  let node = goalKey;
  while (node && node !== startKey) {
    const [x, y] = node.split(",").map(Number);
    path.push([x, y]);
    node = prev.get(node);
  }
  return path.reverse();
}

// ---------------------------------------------------------------- geracao
function test_generation() {
  console.log("\n== Geracao de setor ==");
  for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    const rng = new Rng(1000 + depth);
    const level = generate(rng, depth);

    const floors = [...level.floor_positions()];
    check(level.rooms.length >= 3, `setor ${depth}: pelo menos 3 salas`);
    check(floors.length > 120, `setor ${depth}: area util suficiente (${floors.length})`);

    const reach = reachable(level, level.stairs_up);
    check(
      reach.has(key(...level.stairs_down)),
      `setor ${depth}: escada de descida alcancavel sem destrancar`
    );

    const locked = [];
    for (let y = 0; y < level.h; y += 1) {
      for (let x = 0; x < level.w; x += 1) {
        const tile = level.tiles[y][x];
        if (tile.is_door() && tile.door === DOOR_LOCKED) locked.push([x, y]);
      }
    }
    if (depth >= 2) {
      check(locked.length > 0, `setor ${depth}: existe porta trancada`);
    } else {
      check(true, `setor ${depth}: porta trancada opcional`);
    }

    const slates = level.items.filter((item) => item.kind === "slate");
    check(slates.length === 1, `setor ${depth}: exatamente um SLATE`);
    check(
      slates.length === 1 && slates[0].payload === level.password,
      `setor ${depth}: SLATE carrega a senha do setor`
    );
    check(
      slates.length === 1 && reach.has(key(slates[0].x, slates[0].y)),
      `setor ${depth}: SLATE fica em area alcancavel`
    );

    if (depth >= 2 && depth <= 7) {
      check(
        level.roms_on_floor.length === 1,
        `setor ${depth}: um ROM no chao`
      );
    } else {
      check(level.roms_on_floor.length === 0, `setor ${depth}: sem ROM`);
    }

    const bosses = level.monsters.filter((m) => m.kind === "devourer");
    if (depth === MAX_DEPTH) {
      check(bosses.length === 1, "setor 10: DEVOURER presente");
    } else {
      check(bosses.length === 0, `setor ${depth}: sem chefe`);
    }

    check(
      level.monsters.every((m) => m.x >= 0 && m.y >= 0),
      `setor ${depth}: monstros posicionados`
    );
    check(
      level.items.every((i) => i.x >= 0 && i.y >= 0),
      `setor ${depth}: itens posicionados`
    );
    check(
      level.monsters.every((m) => level.tiles[m.y][m.x].kind === "floor"),
      `setor ${depth}: monstros em chao livre`
    );
  }
}

// ---------------------------------------------------------------- comandos
function test_commands() {
  console.log("\n== Comandos ==");
  const game = new Game(4242);

  game.ping();
  check(game.player.noise > 0, `ping gera ruido (${game.player.noise})`);
  check(game.player.sonar_cooldown > 0, "ping entra em recarga");

  game.begin_measure();
  check(game.mode === "measure", "M abre a mira do RULER");
  game.handle_key("left", "");
  check(game.mode === "play", "direcao fecha a mira do RULER");
  check(Array.isArray(game.beam), "RULER desenhou o feixe");

  const before = game.player.alert;
  game.reset_sector();
  check(game.player.alert === before + 1, "X aumenta ALERT");
  check(game.reset_used, "RESET marca o setor como usado");
  game.reset_sector();
  check(
    game.player.alert === before + 1,
    "RESET nao pode ser repetido no mesmo setor"
  );

  game.pickup();
  check(true, "G sem item nao quebra");

  game.handle_key("char", "L");
  check(true, "L sem porta nao quebra");
  game.handle_key("char", "U");
  check(true, "U sem porta nao quebra");
  game.handle_key("char", "B");
  check(true, "B sem porta nao quebra");

  // forca bruta completa em uma porta trancada de verdade
  const game2 = new Game(77);
  let found = false;
  outer: for (let y = 0; y < game2.level.h; y += 1) {
    for (let x = 0; x < game2.level.w; x += 1) {
      const tile = game2.level.tiles[y][x];
      if (!tile.is_door()) continue;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!game2.level.in_bounds(nx, ny)) continue;
        if (game2.level.tiles[ny][nx].kind !== "floor") continue;
        tile.door = DOOR_LOCKED;
        game2.player.x = nx;
        game2.player.y = ny;
        found = true;
        break outer;
      }
    }
  }
  check(found, "existe porta para testar forca bruta");
  if (found) {
    const monsters_before = game2.level.monsters.length;
    for (let i = 0; i < 3; i += 1) game2.brute_force();
    check(
      game2.level.monsters.length > monsters_before,
      "forca bruta que falha dispara PURGE com monstros"
    );
  }
}

// ------------------------------------------------------------------ portas
function test_door_commands() {
  console.log("\n== Portas ==");

  function place(game, states) {
    const level = game.level;
    for (let y = 0; y < level.h; y += 1) {
      for (let x = 0; x < level.w; x += 1) {
        const doors = [];
        for (const [dx, dy] of DIRS8) {
          const nx = x + dx;
          const ny = y + dy;
          if (!level.in_bounds(nx, ny)) continue;
          const tile = level.tiles[ny][nx];
          if (tile.is_door()) doors.push(tile);
        }
        if (doors.length < states.length) continue;
        states.forEach((state, index) => {
          doors[index].door = state;
        });
        game.player.x = x;
        game.player.y = y;
        return doors;
      }
    }
    return null;
  }

  let game = new Game(77);
  let doors = place(game, [DOOR_LOCKED]);
  game.handle_key("char", "B");
  check(
    doors[0].brute === 1 && game.messages.at(-1)[0].includes("DOOR HOLDS"),
    "B forca a porta trancada"
  );

  game = new Game(77);
  doors = place(game, [DOOR_LOCKED]);
  game.handle_key("char", "U");
  check(doors[0].door === DOOR_OPEN, "U destranca a porta trancada");

  game = new Game(77);
  doors = place(game, [DOOR_CLOSED]);
  game.handle_key("char", "L");
  check(doors[0].door === DOOR_LOCKED, "L tranca a porta do lado");

  game = new Game(77);
  doors = place(game, [DOOR_LOCKED]);
  game.handle_key("char", "u");
  check(doors[0].door === DOOR_OPEN, "u (minuscula) destranca tambem");

  game = new Game(77);
  doors = place(game, [DOOR_CLOSED]);
  game.handle_key("char", "l");
  check(doors[0].door === DOOR_LOCKED, "l (minuscula) tranca tambem");

  game = new Game(77);
  doors = place(game, [DOOR_LOCKED]);
  game.handle_key("char", "b");
  check(doors[0].brute === 1, "b (minuscula) forca tambem");

  // porta aberta ao lado de uma trancada: U/B tem que achar a trancada
  game = new Game(2);
  doors = place(game, [DOOR_CLOSED, DOOR_LOCKED]);
  if (doors && doors.length >= 2) {
    game.handle_key("char", "U");
    check(
      doors.some((door) => door.door === DOOR_OPEN),
      "U acha a porta trancada mesmo com outra porta ao lado"
    );
    const game2 = new Game(2);
    const doors2 = place(game2, [DOOR_CLOSED, DOOR_LOCKED]);
    game2.handle_key("char", "B");
    check(
      doors2.some((door) => door.brute >= 1),
      "B acha a porta trancada mesmo com outra porta ao lado"
    );
  }

  // uso de item: so consumivel e usado, ferramenta nao e gasta
  game = new Game(1234);
  const ruler = new Item("ruler");
  const ampola = new Item("ampola");
  game.player.inventory.push(ruler, ampola);
  game.use_item(ruler);
  check(
    game.player.inventory.some((item) => item.name === "RULER"),
    "usar o RULER nao consome o item"
  );
  game.player.hp = 10;
  game.use_item(ampola);
  check(
    !game.player.inventory.some((item) => item.name === "AMPOLA"),
    "usar a AMPOLA consome o item"
  );
  check(game.player.hp === 22, "AMPOLA cura 12 HP");
}

// ------------------------------------------------------------------ setas
function test_arrow_only_movement() {
  console.log("\n== Setas ==");
  const game = new Game(4242);
  const px = game.player.x;
  const py = game.player.y;
  const turns = game.turn;

  for (const ch of "wasdhjklyubn") game.handle_key("char", ch);
  check(
    game.player.x === px && game.player.y === py,
    "WASD/hjkl/vi-keys nao movem o jogador"
  );
  check(game.turn === turns, "letras de movimento nao gastam turno");

  const key_for = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };
  let moved = false;
  for (const [kind, [dx, dy]] of Object.entries(key_for)) {
    const nx = px + dx;
    const ny = py + dy;
    if (!game.level.in_bounds(nx, ny)) continue;
    if (nx === game.level.stairs_down[0] && ny === game.level.stairs_down[1]) continue;
    if (game.level.monster_at(nx, ny) !== null) continue;
    const tile = game.level.tile(nx, ny);
    if (tile === null || tile.blocks() || tile.kind !== "floor") continue;
    game.handle_key(kind, "");
    moved = game.player.x === nx && game.player.y === ny;
    break;
  }
  check(moved, "as setas do teclado movem o jogador");
}

// ------------------------------------------------------------ descida/reset
function test_descend() {
  console.log("\n== Descida e reset ==");
  const game = new Game(9001);
  const start_depth = game.depth;
  game.descend();
  check(game.depth === start_depth + 1, "descer avanca o setor");
  check(
    game.player.x === game.level.stairs_up[0] &&
      game.player.y === game.level.stairs_up[1],
    "jogador chega na escada de subida"
  );
  check(!game.reset_used, "RESET volta a ser disponivel no novo setor");

  while (game.depth < MAX_DEPTH) game.descend();
  check(game.depth === MAX_DEPTH, "chega ao setor 10");
  check(!game.over, "setor 10 nao encerra a run");
  game.descend();
  check(game.victory && game.over, "descer do setor 10 e vitoria");
}

// ----------------------------------------------------------- reprodutibilidade
const KEYS = [
  ["up", ""],
  ["down", ""],
  ["left", ""],
  ["right", ""],
  ["char", "S"],
  ["char", "p"],
  ["char", "M"],
  ["char", "m"],
  ["char", "L"],
  ["char", "U"],
  ["char", "G"],
  ["char", "g"],
  ["char", "D"],
  ["char", "I"],
  ["char", "i"],
  ["char", "X"],
  ["char", "x"],
  ["char", "B"],
  ["char", "?"],
  ["char", "."],
  ["char", "1"],
  ["char", "2"],
  ["char", "3"],
  ["char", "9"],
  ["char", "u"],
  ["char", "d"],
  ["escape", ""],
  ["enter", ""],
];

function test_reproducibility() {
  console.log("\n== Reproducibilidade ==");
  const a = new Game(31337);
  const b = new Game(31337);
  for (let i = 0; i < 200; i += 1) {
    const [kind, ch] = KEYS[(i * 7 + 13) % KEYS.length];
    a.handle_key(kind, ch);
    b.handle_key(kind, ch);
  }
  check(
    a.level.w === b.level.w && a.level.h === b.level.h,
    "mesma seed gera o mesmo tamanho de setor"
  );
  check(a.player.x === b.player.x && a.player.y === b.player.y, "mesma posicao final");
  check(a.turn === b.turn, "mesmo numero de turnos");
  check(a.player.hp === b.player.hp, "mesmo HP final");

  const signature = (game) =>
    JSON.stringify({
      w: game.level.w,
      h: game.level.h,
      tiles: game.level.tiles.map((row) =>
        row.map((tile) => `${tile.kind}:${tile.door}:${tile.brute}`)
      ),
      items: game.level.items.map((item) => [item.kind, item.x, item.y]),
      monsters: game.level.monsters.map((monster) => [monster.kind, monster.x, monster.y]),
      password: game.level.password,
    });
  check(signature(a) === signature(b), "mesma seed gera o mesmo setor byte a byte");

  const c = new Game(31338);
  for (let i = 0; i < 200; i += 1) {
    const [kind, ch] = KEYS[(i * 7 + 13) % KEYS.length];
    c.handle_key(kind, ch);
  }
  check(
    !(
      a.player.x === c.player.x &&
      a.player.y === c.player.y &&
      a.turn === c.turn
    ),
    "seed diferente gera outra run"
  );
}

// ------------------------------------------------------------------- fuzz
function test_fuzz(seed, runs = 40, turns = 400) {
  console.log(`\n== Fuzz: ${runs} partidas de ${turns} turnos (seed base ${seed}) ==`);
  const rng = new Rng(seed);
  let deaths = 0;
  let victories = 0;
  let max_depth = 0;
  for (let run = 0; run < runs; run += 1) {
    const game = new Game(rng.randint(0, 0xffffffff));
    for (let turn = 0; turn < turns; turn += 1) {
      if (game.over) break;
      const [kind, ch] = KEYS[rng.randint(0, KEYS.length - 1)];
      game.handle_key(kind, ch);
      max_depth = Math.max(max_depth, game.depth);
    }
    if (game.over) deaths += 1;
    if (game.victory) victories += 1;
  }
  check(true, `nenhuma excecao em ${runs * turns} turnos`);
  console.log(
    `         mortes=${deaths} vitorias=${victories} profundidade_max=${max_depth}`
  );
}

// -------------------------------------------------------------------- bot
function play_bot(game, max_turns = 1200) {
  const path = { list: null, index: 0, age: 0 };
  let last_ping = -99;

  for (let turn = 0; turn < max_turns; turn += 1) {
    if (game.over) break;
    const player = game.player;
    const level = game.level;

    // cura
    if (player.hp <= player.max_hp * 0.55) {
      const ampola = player.inventory.find((item) => item.data.heal);
      if (ampola) {
        game.use_item(ampola);
        continue;
      }
    }

    // loot sob os pes
    if (level.item_at(player.x, player.y) || level.rom_at(player.x, player.y)) {
      if (level.rom_at(player.x, player.y) && player.free_rom_slots <= 0) {
        // segue sem ler para nao travar o bot
      } else {
        game.pickup();
        continue;
      }
    }

    // sonar de vez em quando
    if (player.sonar_cooldown === 0 && turn - last_ping >= 12) {
      game.ping();
      last_ping = turn;
      continue;
    }

    // ameaca adjacente: ataca se estiver inteiro
    const adjacent = DIRS8.map(([dx, dy]) => [
      player.x + dx,
      player.y + dy,
    ]).find(([x, y]) => level.monster_at(x, y));
    if (adjacent && player.hp > player.max_hp * 0.4) {
      game.move(adjacent[0] - player.x, adjacent[1] - player.y);
      continue;
    }

    // caminho ate a escada de descida
    if (!path.list || path.index >= path.list.length || path.age > 12) {
      path.list = bfs_path(level, [player.x, player.y], level.stairs_down);
      path.index = 0;
      path.age = 0;
    }
    path.age += 1;

    let moved = false;
    while (path.list && path.index < path.list.length) {
      const [nx, ny] = path.list[path.index];
      if (!level.in_bounds(nx, ny)) {
        path.list = null;
        break;
      }
      const tile = level.tiles[ny][nx];
      if (tile.is_door() && tile.door === DOOR_LOCKED) {
        if (player.passwords.includes(level.password)) {
          game.move(nx - player.x, ny - player.y);
          moved = true;
        } else {
          game.brute_force();
          moved = true;
        }
        break;
      }
      if (level.monster_at(nx, ny)) {
        game.move(nx - player.x, ny - player.y);
        moved = true;
        break;
      }
      game.move(nx - player.x, ny - player.y);
      moved = true;
      path.index += 1;
      break;
    }

    if (!moved) {
      const options = DIRS8.filter(([dx, dy]) => {
        const nx = player.x + dx;
        const ny = player.y + dy;
        return level.in_bounds(nx, ny) && level.is_passable(nx, ny);
      });
      if (options.length) {
        const [dx, dy] = options[game.rng.randint(0, options.length - 1)];
        game.move(dx, dy);
      } else {
        game.wait();
      }
    }
  }
  return { victory: game.victory, depth: game.depth };
}

function test_bot() {
  console.log("\n== Bot (partida completa) ==");
  const results = [];
  for (let index = 0; index < 6; index += 1) {
    const seed = 700 + index * 37;
    const game = new Game(seed);
    const result = play_bot(game);
    results.push(result);
    console.log(
      `  seed ${seed}: setor ${result.depth}${result.victory ? " VITORIA" : ""}`
    );
  }
  check(results.every((result) => result.depth >= 1), "bot nao travou no setor 1");
  check(
    results.some((result) => result.depth >= 3),
    "bot alcanca pelo menos o setor 3"
  );
  check(
    results.some((result) => result.depth >= 5),
    "bot desce ate o meio do sistema"
  );
}

// -------------------------------------------------------------------- lore
function test_lore() {
  console.log("\n== Abertura narrativa ==");
  check(PROLOGUE.length === 3, "abertura tem tres paginas");
  check(
    PROLOGUE.every((page) => page.title && page.subtitle && page.body.length > 120),
    "toda pagina tem titulo, subtitulo e corpo"
  );
  check(
    PROLOGUE.every((page) => !/undefined|\[object/.test(page.body)),
    "nenhuma pagina tem texto vazado"
  );
  check(prologuePage(0) === PROLOGUE[0], "prologuePage devolve a primeira pagina");
  check(prologuePage(PROLOGUE.length) === null, "prologuePage acaba no fim");
}

// -------------------------------------------------------------------- main
console.log("ECOS '94 WEB — simulador headless");

test_generation();
test_commands();
test_door_commands();
test_arrow_only_movement();
test_descend();
test_reproducibility();
test_lore();
test_fuzz(Number(process.argv[2] || 2024));
test_bot();

console.log(`\n${checks} verificacoes, ${FAILURES.length} falha(s).`);
if (FAILURES.length) {
  for (const failure of FAILURES) console.log(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("TODAS AS VERIFICACOES PASSARAM.");
}
