/**
 * Renderizador do mapa em canvas.
 *
 * Mantem a linguagem visual do original: caracteres monoespaçados,
 * paleta VGA, tres estados de memoria por tile (desconhecido, lembrado,
 * iluminado) e camera centrada no jogador com clamp nas bordas.
 */

import { C, color } from "./theme.js";

const FONT_STACK =
  '"Cascadia Mono", "Consolas", "DejaVu Sans Mono", "Courier New", monospace';

const G_FLOOR = "·";
const G_WALL = "█";
const G_DOOR = "+";
const G_STAIRS_UP = "<";
const G_STAIRS_DOWN = ">";
const G_PLAYER = "@";
const G_BEAM = "─";
const G_ROM = "R";

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.info = {
      cell: 16,
      cols: 0,
      rows: 0,
      vx: 0,
      vy: 0,
      ox: 0,
      oy: 0,
      width: 0,
      height: 0,
    };
  }

  /** Camera do original: centraliza quando o setor e menor que a tela. */
  camera(game, cols, rows) {
    const level = game.level;
    const player = game.player;
    let vx;
    let vy;
    if (level.w <= cols) vx = Math.floor((level.w - cols) / 2);
    else vx = clamp(player.x - Math.floor(cols / 2), 0, level.w - cols);
    if (level.h <= rows) vy = Math.floor((level.h - rows) / 2);
    else vy = clamp(player.y - Math.floor(rows / 2), 0, level.h - rows);
    return [vx, vy];
  }

  draw(game) {
    if (!game || !game.level) return;
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const pixelWidth = Math.round(rect.width * dpr);
    const pixelHeight = Math.round(rect.height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;

    // O mapa sempre mostra pelo menos ~22x15 tiles, sem ficar ilegivel.
    const cell = Math.max(
      8,
      Math.min(30, Math.floor(Math.min(width / 22, height / 15)))
    );
    const cols = Math.max(1, Math.floor(width / cell));
    const rows = Math.max(1, Math.floor(height / cell));
    const ox = Math.floor((width - cols * cell) / 2);
    const oy = Math.floor((height - rows * cell) / 2);

    const [vx, vy] = this.camera(game, cols, rows);
    this.info = { cell, cols, rows, vx, vy, ox, oy, width, height };

    // Limpa o quadro inteiro: sem isso, setor novo (RESET) e paineis
    // fechados deixariam sombra na tela.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const level = game.level;
    const player = game.player;
    const beamVisible = game.turn - game.beam_turn <= 4;
    const beam = new Set(
      beamVisible ? game.beam.map(([x, y]) => `${x},${y}`) : []
    );

    ctx.font = `${Math.max(7, Math.round(cell * 0.92))}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let row = 0; row < rows; row += 1) {
      const y = vy + row;
      if (y < 0 || y >= level.h) continue;
      const knownRow = level.known[y];
      for (let col = 0; col < cols; col += 1) {
        const x = vx + col;
        if (x < 0 || x >= level.w) continue;
        const known = knownRow[x];
        if (known === 0) continue; // desconhecido: fica vazio

        const tile = level.tiles[y][x];
        const lit = known === 2;
        const px = ox + col * cell;
        const py = oy + row * cell;

        if (tile.kind === "wall") {
          ctx.fillStyle = lit ? color(C.WHITE, 0.88) : color(C.DGRAY, 0.9);
          ctx.fillRect(px, py, cell, cell);
          continue;
        }

        if (tile.kind === "door") {
          let fg = C.GREEN;
          if (tile.door === "locked") fg = C.LRED;
          else if (tile.door === "closed") fg = C.BROWN;
          ctx.fillStyle = color(fg, lit ? 1 : 0.55);
          ctx.fillText(G_DOOR, px + cell / 2, py + cell / 2 + 1);
          continue;
        }

        ctx.fillStyle = color(C.WHITE, lit ? 0.7 : 0.24);
        ctx.fillText(G_FLOOR, px + cell / 2, py + cell / 2 + 1);
      }
    }

    // Feixe do RULER (some depois de alguns turnos).
    if (beam.size) {
      ctx.fillStyle = color(C.LCYAN);
      for (const cellKey of beam) {
        const [x, y] = cellKey.split(",").map(Number);
        const col = x - vx;
        const row = y - vy;
        if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
        ctx.fillText(
          G_BEAM,
          ox + col * cell + cell / 2,
          oy + row * cell + cell / 2 + 1
        );
      }
    }

    // Escadas
    const drawStairs = (pos, glyph, fg) => {
      const [x, y] = pos;
      if (!level.known[y][x]) return;
      const col = x - vx;
      const row = y - vy;
      if (col < 0 || col >= cols || row < 0 || row >= rows) return;
      ctx.fillStyle = color(fg);
      ctx.fillText(
        glyph,
        ox + col * cell + cell / 2,
        oy + row * cell + cell / 2 + 1
      );
    };
    drawStairs(level.stairs_up, G_STAIRS_UP, C.LGRAY);
    drawStairs(level.stairs_down, G_STAIRS_DOWN, C.YELLOW);

    // Itens lembrados (visiveis mesmo depois que o tile escurece)
    for (const item of level.items) {
      const col = item.x - vx;
      const row = item.y - vy;
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      if (!level.known[item.y][item.x]) continue;
      ctx.fillStyle = color(item.color);
      ctx.fillText(
        item.glyph,
        ox + col * cell + cell / 2,
        oy + row * cell + cell / 2 + 1
      );
    }

    // ROMs no chao
    for (const rom of level.roms_on_floor) {
      const col = rom.x - vx;
      const row = rom.y - vy;
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      if (!level.known[rom.y][rom.x]) continue;
      ctx.fillStyle = color(C.YELLOW);
      ctx.fillText(
        G_ROM,
        ox + col * cell + cell / 2,
        oy + row * cell + cell / 2 + 1
      );
    }

    // Monstros: so os que estao iluminados agora
    for (const monster of level.monsters) {
      if (!monster.alive) continue;
      if (level.known[monster.y][monster.x] !== 2) continue;
      const col = monster.x - vx;
      const row = monster.y - vy;
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      ctx.fillStyle = color(monster.color);
      ctx.fillText(
        monster.glyph,
        ox + col * cell + cell / 2,
        oy + row * cell + cell / 2 + 1
      );
    }

    // Jogador
    const pcol = player.x - vx;
    const prow = player.y - vy;
    if (pcol >= 0 && pcol < cols && prow >= 0 && prow < rows) {
      ctx.save();
      ctx.shadowColor = color(C.LGREEN, 0.9);
      ctx.shadowBlur = Math.max(4, cell * 0.5);
      ctx.fillStyle = color(C.WHITE);
      ctx.fillText(
        G_PLAYER,
        ox + pcol * cell + cell / 2,
        oy + prow * cell + cell / 2 + 1
      );
      ctx.restore();
    }
  }

  /** Posicao do tile no canvas (para o ripple do sonar). */
  screen_pos(x, y) {
    const { cell, vx, vy, ox, oy } = this.info;
    return {
      x: ox + (x - vx) * cell + cell / 2,
      y: oy + (y - vy) * cell + cell / 2,
      radius: cell,
    };
  }
}
