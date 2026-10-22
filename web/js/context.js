/**
 * Acoes contextuais do botao INTERACT.
 *
 * A lista e montada a partir do estado do jogo: o que esta sob o jogador,
 * as portas ao lado e os instrumentos que ele carrega. A interface apenas
 * desenha esses itens; executar cada um e responsabilidade do app.
 */

import * as status from "./status.js";

export function build_context(game) {
  if (!game || game.over) return [];
  const player = game.player;
  const level = game.level;
  const actions = [];

  // ---------------------------------------------------------- sob os pes
  const rom = level.rom_at(player.x, player.y);
  if (rom !== null) {
    actions.push({
      id: "read_rom",
      label: `READ ${rom.name}`,
      detail: `${rom.desc} · ${rom.kg} KG`,
      tone: "yellow",
      key: "G",
      payload: rom,
      primary: true,
    });
  }

  const item = level.item_at(player.x, player.y);
  if (item !== null) {
    let detail = `${item.kg} KG`;
    if (item.category === "slate" && item.payload) {
      detail += ` · PASSWORD ${item.payload}`;
    }
    actions.push({
      id: "pickup",
      label: `TAKE ${item.name}`,
      detail,
      tone: "green",
      key: "G",
      payload: item,
      primary: rom === null,
    });
  }

  // --------------------------------------------------------------- portas
  const doors = game.adjacent_doors();
  const locked = doors.find((door) => door.tile.door === "locked");
  const closed = doors.find((door) => door.tile.door === "closed");

  if (closed) {
    const dx = closed.x - player.x;
    const dy = closed.y - player.y;
    actions.push({
      id: "open_door",
      label: "OPEN DOOR",
      detail: "+4 NOISE",
      tone: "cyan",
      key: "→",
      payload: { dx, dy },
    });
  }
  if (locked) {
    const has_password =
      level.password && player.passwords.includes(level.password);
    actions.push({
      id: "unlock_door",
      label: "UNLOCK DOOR",
      detail: player.kernel
        ? "KERNEL · SILENT"
        : has_password
          ? `SLATE ${level.password} · +4 NOISE`
          : "+4 NOISE",
      tone: "green",
      key: "U",
    });
    actions.push({
      id: "brute_force",
      label: "FORCE DOOR",
      detail: `ATTEMPT ${locked.tile.brute + 1}/3 · PURGE RISK`,
      tone: "red",
      key: "B",
      danger: true,
    });
  }

  const any_unlocked = doors.some((door) => door.tile.door !== "locked");
  if (any_unlocked) {
    actions.push({
      id: "lock_door",
      label: "LOCK DOOR",
      detail: "+4 NOISE · SEALS THE CORRIDOR",
      tone: "yellow",
      key: "L",
    });
  }

  // ----------------------------------------------------------- instrumentos
  const cooldown = player.sonar_cooldown;
  actions.push({
    id: "ping",
    label: "SONAR PING",
    detail:
      cooldown > 0
        ? `RECHARGING · ${cooldown} TURN${cooldown > 1 ? "S" : ""}`
        : `RADIUS ${status.sonar_radius(player)} · +${status.ping_noise(player)} NOISE`,
    tone: "cyan",
    key: "S",
    disabled: cooldown > 0,
  });

  if (player.has_ruler) {
    actions.push({
      id: "measure",
      label: "RULER",
      detail: "+2 NOISE · MEASURE A STRAIGHT LINE",
      tone: "cyan",
      key: "M",
    });
  }

  // -------------------------------------------------------------- turno
  actions.push({
    id: "wait",
    label: "WAIT",
    detail: "1 TURN · LET THE NOISE FADE",
    tone: "plain",
    key: ".",
  });

  if (!game.reset_used) {
    actions.push({
      id: "reset",
      label: "RESET SECTOR",
      detail: "ALERT +1 · PERMANENT · NEW LAYOUT",
      tone: "red",
      key: "X",
      danger: true,
    });
  }

  actions.push({
    id: "help",
    label: "HELP",
    detail: "CONTROLS AND SYSTEMS",
    tone: "plain",
    key: "?",
  });

  return actions;
}

/** Menor distancia ate uma porta adjacente, para o subtitulo do painel. */
export function context_subtitle(game) {
  const player = game.player;
  return `SECTOR ${game.depth} · TURN ${game.turn} · NOISE ${player.noise} · LOAD ${player.load}/${player.capacity}`;
}
