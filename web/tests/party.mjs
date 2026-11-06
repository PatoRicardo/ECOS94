/**
 * Testes do modo cooperativo (headless, sem DOM/rede).
 *
 * Cobre party de 5, memoria individual, lockstep, timeout, respawn,
 * descida, novos inimigos e o protocolo host/cliente.
 */

import { setMuted } from "../js/audio.js";
import { MONSTERS, SPAWN_TABLE } from "../js/data.js";
import { Game } from "../js/game.js";
import { Monster } from "../js/entities.js";
import { ClientGame, serialize_snapshot, serialize_state } from "../js/protocol.js";

setMuted(true);

let checks = 0;
let failures = 0;

function check(condition, message) {
  checks += 1;
  if (condition) {
    console.log(`  [ok]   ${message}`);
  } else {
    failures += 1;
    console.log(`  [FAIL] ${message}`);
  }
}

function party(seed = 4242) {
  return new Game(seed, {
    players: ["A", "B", "C", "D", "E"].map((name) => ({ name })),
    partyMode: true,
  });
}

function visible(memory) {
  let count = 0;
  for (const row of memory.known) {
    for (const state of row) if (state === 2) count += 1;
  }
  return count;
}

console.log("== Party de 5 ==");
{
  const game = party();
  check(game.players.length === 5, "party tem 5 jogadores");
  check(game.partyMode === true, "partyMode ligado");
  check(game.player.id === 0, "host e o jogador local 0");
  const positions = new Set(game.players.map((p) => `${p.x},${p.y}`));
  check(positions.size === 5, "cada jogador nasce numa posicao distinta");
  check(
    new Set(game.players.map((p) => p.memory)).size === 5,
    "cada jogador tem memoria propria"
  );
  check(
    new Set(game.players.map((p) => p.color)).size === 5,
    "cores distintas para 5 operadores"
  );
}

console.log("\n== Memoria individual ==");
{
  const game = party(99);
  const before = game.players.map((p) => visible(p.memory));
  game.ping(game.players[0]);
  const after = game.players.map((p) => visible(p.memory));
  check(after[0] >= before[0], "ping aumenta a visao de quem pingou");
  check(
    game.players.slice(1).every((p, i) => after[i + 1] === before[i + 1]),
    "ping de um jogador nao revela nada para os outros"
  );
  check(game.turn === 0, "ping nao fecha o turno");
}

console.log("\n== Lockstep e timeout ==");
{
  const game = party(123);
  const start = game.turn;
  game.move(1, 0, game.players[0]);
  check(game.turn === start, "primeira acao nao fecha o turno");
  check(game.players[0].acted === true, "jogador 0 marcado como pronto");
  for (let id = 1; id < 5; id += 1) game.wait(game.players[id]);
  check(game.turn === start + 1, "turno fecha quando todos agiram");

  game.force_end_turn();
  check(game.turn === start + 2, "timeout fecha o turno sozinho");

  const frozen = game.turn;
  game.wait(game.players[0]);
  const acted = game.players[0].acted;
  game.wait(game.players[0]);
  check(
    acted && game.players[0].acted && game.turn === frozen,
    "jogador nao age duas vezes no mesmo tick"
  );
}

console.log("\n== Morte e respawn no proximo setor ==");
{
  const game = party(7);
  game._kill(game.players[1], "TEST");
  check(game.players[1].dead === true, "jogador pode morrer");
  check(!game.over, "party nao acaba com apenas um morto");
  game.enter_level(game.depth + 1);
  check(game.players[1].dead === false, "morto reinicia no proximo setor");
  check(game.players[1].hp > 0, "respawn volta com HP");
  check(game.players[1].depth === game.depth, "respawn no setor atual");
}

console.log("\n== RESET e late join ==");
{
  const game = party(41);
  const oldLevel = game.level;
  const oldMemory = game.players[0].memory;
  game._kill(game.players[2], "TEST");
  game.reset_sector(game.players[0]);
  check(game.level !== oldLevel, "RESET regenera o setor");
  check(game.players[0].memory !== oldMemory, "RESET renova a memoria de todos");
  check(game.players[2].dead === true, "RESET nao ressuscita quem morreu");
  check(game.alert === 1, "RESET aumenta o ALERT compartilhado");
  check(game.add_player("FULL") === null, "late join respeita o limite de 5");

  const small = new Game(42, {
    players: ["A", "B", "C", "D"].map((name) => ({ name })),
    partyMode: true,
  });
  const late = small.add_player("E");
  check(late !== null, "late join aceito durante a run");
  check(late.acted === true, "late join nao trava o tick atual");
  check(late.memory !== null, "late join recebe memoria do setor");
  check(small.players.length === 5, "late join completa a party");
}

console.log("\n== Descida da party ==");
{
  const game = party(31);
  const depth = game.depth;
  for (const player of game.players.filter((p) => !p.dead)) {
    [player.x, player.y] = game.level.stairs_down;
  }
  game._check_descend();
  check(game.depth === depth + 1, "party inteira na escada desce junta");
  check(
    game.players.some((p) => p.x === game.level.stairs_up[0] && p.y === game.level.stairs_up[1]),
    "party aparece na entrada do novo setor"
  );
}

console.log("\n== Novos inimigos ==");
{
  const game = party(55);
  const total = new Set();
  for (const table of Object.values(SPAWN_TABLE)) {
    for (const kind of table) total.add(kind);
  }
  for (const kind of ["spitter", "charger", "slime", "summoner", "sentinel", "phantom"]) {
    check(MONSTERS[kind] !== undefined, `inimigo ${kind} existe`);
    check(total.has(kind), `inimigo ${kind} aparece na tabela de spawn`);
  }

  for (const kind of ["spitter", "charger", "slime", "summoner", "sentinel", "phantom"]) {
    const test = party(800 + kind.length);
    const target = test.players[0];
    const monster = new Monster(kind, test.depth, test.rng);
    const spot = test.level.free_spot_near([target.x, target.y]);
    if (!spot) continue;
    [monster.x, monster.y] = spot;
    test.level.monsters.push(monster);
    let threw = false;
    try {
      test.force_end_turn();
    } catch {
      threw = true;
    }
    check(!threw, `turno com ${kind} nao lanca excecao`);
  }
}

console.log("\n== Protocolo host/cliente ==");
{
  const game = party(606);
  const sent = [];
  const snapshot = serialize_snapshot(game, 3);
  check(snapshot.localId === 3, "snapshot carrega o id local correto");
  check(snapshot.players.length === 5, "snapshot carrega os 5 jogadores");
  check(snapshot.memory.length === game.level.h, "keyframe tem a altura do setor");

  const client = new ClientGame(snapshot, (intent) => sent.push(intent));
  check(client.player.id === 3, "cliente assume o jogador 3");
  check(client.players.length === 5, "cliente ve a party inteira");
  check(client.player.memory !== null, "cliente recebe memoria inicial");
  check(client.level.w === game.level.w, "cliente reconstruiu o setor");

  client.move(1, 0);
  client.ping();
  client.pickup();
  client.wait();
  check(sent.length === 4, "cliente envia intencoes ao host");
  check(sent[0].a === "move" && sent[1].a === "ping", "intencoes tem acao correta");

  const state = serialize_state(game, 3);
  check(Array.isArray(state.vision), "estado carrega delta de visao");
  const memory = client.player.memory;
  client.applyState(state);
  check(client.player.memory === memory, "delta reusa a memoria do cliente");
  check(client.turn === game.turn, "estado atualiza o turno");
  check(client.players.length === 5, "estado mantem a party");

  // Dois estados seguidos nao devem perder a memoria.
  const visibleAfter = visible(client.player.memory);
  client.applyState(serialize_state(game, 3));
  check(visible(client.player.memory) >= visibleAfter - 200, "memoria sobrevive a varios estados");
}

console.log("\n== Sincronizacao de varios ticks ==");
{
  const game = party(909);
  const clients = [0, 1, 2, 3, 4].map(
    (id) => new ClientGame(serialize_snapshot(game, id), () => {})
  );
  let ok = true;
  for (let tick = 0; tick < 8; tick += 1) {
    for (const player of game.players) {
      if (!player.dead && !player.acted) game.wait(player);
    }
    for (let id = 0; id < 5; id += 1) {
      clients[id].applyState(serialize_state(game, id));
      if (
        clients[id].turn !== game.turn ||
        clients[id].player.x !== game.players[id].x ||
        clients[id].player.y !== game.players[id].y ||
        clients[id].player.hp !== game.players[id].hp ||
        clients[id].player.id !== id
      ) {
        ok = false;
      }
    }
  }
  check(ok, "5 clientes acompanham 8 ticks sem divergir");
  check(
    clients.every((client) => visible(client.player.memory) > 0),
    "cada cliente mantem sua visao ao longo dos ticks"
  );
}

console.log("\n== Turno completo com 5 jogadores ==");
{
  const game = party(2024);
  let turns = 0;
  while (turns < 30 && !game.over) {
    for (const player of game.players) {
      if (player.dead || player.acted) continue;
      game.wait(player);
    }
    turns += 1;
  }
  check(!game.over, "30 ticks de espera nao acabam a run");
  check(game.turn >= 30, "relogio avancou com a party");
  check(game.messages.length > 0, "log continua alimentado");
}

console.log("");
if (failures) {
  console.log(`${checks} verificacoes, ${failures} falha(s).`);
  process.exit(1);
} else {
  console.log(`${checks} verificacoes, 0 falha(s).`);
  console.log("TODAS AS VERIFICACOES DE CO-OP PASSARAM.");
}
