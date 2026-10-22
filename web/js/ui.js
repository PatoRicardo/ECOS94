/** Camada de interface: HUD, log, paineis, inventario e botoes. */

import { MAX_DEPTH } from "./data.js";
import { C, color } from "./theme.js";

const $ = (selector) => document.querySelector(selector);

function pad2(value) {
  return String(value).padStart(2, "0");
}

function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pct(value, maximum) {
  if (!maximum) return 0;
  return Math.max(0, Math.min(100, (value / maximum) * 100));
}

const refs = {};

const CATEGORY_LABEL = {
  weapon: "WEAPON",
  armor: "ARMOR",
  consumable: "CONSUMABLE",
  tool: "TOOL",
  slate: "SLATE",
};

function item_detail(item) {
  const data = item.data;
  if (item.category === "weapon") return `DAMAGE +${data.atk}`;
  if (item.category === "armor") return `DEFENSE +${data.dfn}`;
  if (data.heal) return `HEALS ${data.heal} HP`;
  if (data.noise < 0) return `NOISE ${data.noise}`;
  if (data.stun) return `STUNS WITHIN ${data.stun} TILES · NOISE +${data.noise}`;
  if (item.category === "slate") return `PASSWORD: ${item.payload}`;
  if (item.category === "tool") return "MEASURES A STRAIGHT LINE · 2 NOISE";
  return "";
}

export const ui = {
  game: null,
  app: null,
  logHandler: null,
  overlayOpen: false,

  init(app) {
    this.app = app;
    for (const id of [
      "screen-title",
      "screen-game",
      "logo",
      "title-menu",
      "title-seed",
      "hud-sector",
      "hud-hp",
      "hud-atk",
      "hud-def",
      "hud-alert",
      "hud-load",
      "hud-noise",
      "hud-roms",
      "hud-slots",
      "bar-load",
      "bar-noise",
      "log",
      "hint",
      "stage",
      "ripple",
      "overlay",
      "overlay-title",
      "overlay-sub",
      "overlay-body",
      "overlay-actions",
      "overlay-close",
      "panel",
      "boot",
      "boot-text",
      "btn-interact",
      "btn-inventory",
    ]) {
      refs[id] = document.getElementById(id);
    }

    refs.log.addEventListener("click", () => {
      if (this.game && this.logHandler) this.logHandler();
    });

    refs["overlay-close"].addEventListener("click", () => this.close());

    refs.overlay.addEventListener("click", (event) => {
      if (event.target === refs.overlay) this.close();
    });
  },

  setLogHandler(fn) {
    this.logHandler = fn;
  },

  showScreen(name) {
    refs["screen-title"].classList.toggle("hidden", name !== "title");
    refs["screen-game"].classList.toggle("hidden", name !== "game");
    document.body.dataset.screen = name;
  },

  // ------------------------------------------------------------------- HUD
  render(game) {
    this.game = game;
    if (!game || !game.level) return;
    const player = game.player;

    refs["hud-sector"].textContent = `S${pad2(game.depth)}/${MAX_DEPTH}`;
    refs["hud-hp"].textContent = `HP ${player.hp}/${player.max_hp}`;
    refs["hud-hp"].classList.toggle("low", player.hp <= 5);
    refs["hud-atk"].textContent = `ATK ${player.atk}`;
    refs["hud-def"].textContent = `DEF ${player.dfn}`;
    refs["hud-alert"].textContent = `AL ${player.alert}`;
    refs["hud-alert"].classList.toggle("warn", player.alert > 0);

    const loadRatio = player.load_ratio;
    refs["bar-load"].style.width = `${pct(player.load, player.capacity)}%`;
    refs["bar-load"].dataset.level =
      loadRatio > 0.85 ? "danger" : loadRatio > 0.75 ? "warn" : "ok";
    refs["hud-load"].textContent = `${player.load}/${player.capacity}`;

    const noiseRatio = player.noise / 100;
    refs["bar-noise"].style.width = `${pct(player.noise, 100)}%`;
    refs["bar-noise"].dataset.level =
      noiseRatio >= 0.8 ? "danger" : noiseRatio >= 0.4 ? "warn" : "ok";
    refs["hud-noise"].textContent = `${player.noise}`;

    const roms = player.roms.map((rom) => rom.name).join(", ") || "-";
    refs["hud-roms"].textContent = roms;
    refs["hud-slots"].textContent = `${player.roms.length}/3`;
    refs["hud-roms"].title = player.roms.map((rom) => rom.desc).join(" · ");

    this.renderLog(game);
    this.setHint(
      game.mode === "measure"
        ? "RULER: ESCOLHA UMA DIREÇÃO · ESC CANCELA"
        : ""
    );
    document.body.classList.toggle("measuring", game.mode === "measure");
  },

  renderLog(game) {
    const lines = game.recent(3);
    refs.log.innerHTML = "";
    for (const [text, fg] of lines) {
      const line = document.createElement("div");
      line.className = "line";
      line.style.color = color(fg, 0.95);
      line.textContent = text;
      refs.log.appendChild(line);
    }
    // A mensagem mais nova sempre visivel.
    refs.log.scrollTop = refs.log.scrollHeight;
  },

  setHint(text) {
    refs.hint.textContent = text;
    refs.hint.classList.toggle("hidden", !text);
  },

  // -------------------------------------------------------------- paineis
  openSheet({ title, subtitle = "", body = "", actions = [], wide = false }) {
    this._render({ title, subtitle, body, actions, wide });
  },

  openContent(config) {
    this._render(config);
  },

  _render({ title, subtitle = "", body = "", actions = [], wide = false, locked = false }) {
    refs.overlay.classList.remove("hidden");
    refs.overlay.classList.toggle("wide", Boolean(wide));
    refs["overlay-title"].textContent = title;
    refs["overlay-sub"].textContent = subtitle;
    refs["overlay-sub"].classList.toggle("hidden", !subtitle);
    refs["overlay-body"].innerHTML = body;
    refs["overlay-actions"].innerHTML = "";
    this.overlayOpen = true;
    this.overlayLocked = Boolean(locked);
    refs["overlay-close"].classList.toggle("hidden", this.overlayLocked);

    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      if (action.danger) button.classList.add("danger");
      if (action.primary) button.classList.add("primary");
      if (action.disabled) button.classList.add("disabled");
      button.dataset.tone = action.tone || "plain";
      button.disabled = Boolean(action.disabled);

      const main = document.createElement("span");
      main.className = "opt-main";
      const label = document.createElement("span");
      label.className = "opt-label";
      label.textContent = action.label;
      main.appendChild(label);
      if (action.detail) {
        const detail = document.createElement("span");
        detail.className = "opt-detail";
        detail.textContent = action.detail;
        main.appendChild(detail);
      }
      button.appendChild(main);

      if (action.key) {
        const kbd = document.createElement("kbd");
        kbd.textContent = action.key;
        button.appendChild(kbd);
      }

      button.addEventListener("click", () => {
        if (button.disabled) return;
        this.close();
        if (action.onSelect) action.onSelect();
      });
      refs["overlay-actions"].appendChild(button);
    }

    const first = refs["overlay-actions"].querySelector(
      "button.option:not(.disabled)"
    );
    if (first) first.focus({ preventScroll: true });
    refs["overlay-body"].scrollTop = 0;
  },

  close(force = false) {
    if (!this.overlayOpen) return;
    if (this.overlayLocked && !force) return;
    this.overlayOpen = false;
    this.overlayLocked = false;
    refs.overlay.classList.add("hidden");
    refs["overlay-body"].innerHTML = "";
    refs["overlay-actions"].innerHTML = "";
  },

  isOpen() {
    return this.overlayOpen;
  },

  // ------------------------------------------------------------- inventario
  openInventory(game, app, options = {}) {
    const player = game.player;
    const dropMode = Boolean(options.dropMode);

    const weapon = player.equipped.weapon;
    const armor = player.equipped.armor;

    const equipment = `
      <div class="section">
        <h3>EQUIPMENT</h3>
        <div class="row-item static">
          <span class="glyph" style="color:${color(C.YELLOW)}">${weapon ? weapon.glyph : "-"}</span>
          <span class="nm">${weapon ? esc(weapon.name) : "(NO WEAPON)"}</span>
          <span class="kg">${weapon ? `${weapon.kg} KG` : ""}</span>
        </div>
        <div class="row-item static">
          <span class="glyph" style="color:${color(C.LCYAN)}">${armor ? armor.glyph : "-"}</span>
          <span class="nm">${armor ? esc(armor.name) : "(NO ARMOR)"}</span>
          <span class="kg">${armor ? `${armor.kg} KG` : ""}</span>
        </div>
      </div>`;

    let carried = "";
    if (player.inventory.length === 0) {
      carried = `<p class="empty">(EMPTY)</p>`;
    } else {
      carried = player.inventory
        .map((item, index) => {
          const extra =
            item.kind === "slate" && item.payload
              ? `<span class="tag">${esc(item.payload)}</span>`
              : "";
          return `
            <button type="button" class="row-item" data-item="${index}">
              <span class="glyph" style="color:${color(item.color)}">${esc(item.glyph)}</span>
              <span class="nm">${esc(item.name)}${extra}<small>${esc(item_detail(item))}</small></span>
              <span class="kg">${item.kg} KG</span>
              <span class="chev">›</span>
            </button>`;
        })
        .join("");
    }

    const roms =
      player.roms.length === 0
        ? `<p class="empty">(NONE)</p>`
        : player.roms
            .map(
              (rom) => `
          <div class="row-item static rom">
            <span class="glyph" style="color:${color(C.YELLOW)}">R</span>
            <span class="nm">${esc(rom.name)}<small>${esc(rom.desc)}</small></span>
            <span class="kg">${rom.kg} KG</span>
          </div>`
            )
            .join("");

    const body = `
      <div class="stats">
        <div><span>LOAD</span><b>${player.load} / ${player.capacity}</b><em>${player.load_tier.toUpperCase()}</em></div>
        <div><span>HP</span><b>${player.hp} / ${player.max_hp}</b></div>
        <div><span>ATK</span><b>${player.atk}</b></div>
        <div><span>DEF</span><b>${player.dfn}</b></div>
      </div>
      ${equipment}
      <div class="section">
        <h3>CARRIED <small>${player.inventory.length}</small></h3>
        ${carried}
      </div>
      <div class="section">
        <h3>ROMS <small>${player.roms.length}/3 · PERMANENT</small></h3>
        ${roms}
      </div>`;

    const actions = [
      {
        label: "CLOSE",
        detail: "BACK TO THE SECTOR",
        key: "ESC",
        tone: "plain",
        onSelect: () => {},
      },
    ];

    this.openContent({
      title: dropMode ? "DROP WHAT?" : "INVENTORY",
      subtitle: dropMode
        ? "ESCOLHA UM ITEM PARA LARGAR"
        : "TOQUE EM UM ITEM PARA USAR, EQUIPAR OU LARGAR",
      body,
      actions,
      wide: true,
    });

    for (const button of refs["overlay-body"].querySelectorAll("[data-item]")) {
      button.addEventListener("click", () => {
        const item = player.inventory[Number(button.dataset.item)];
        if (!item) return;
        this.close();
        if (dropMode) {
          app.perform(() => game.drop_item(item));
        } else {
          this.openItem(item, game, app);
        }
      });
    }
  },

  openItem(item, game, app) {
    const actions = [];

    if (item.category === "consumable") {
      actions.push({
        label: "USE",
        detail: item_detail(item),
        key: "U",
        tone: "green",
        primary: true,
        onSelect: () => app.perform(() => game.use_item(item)),
      });
    } else if (item.category === "weapon" || item.category === "armor") {
      actions.push({
        label: "EQUIP",
        detail: item_detail(item),
        key: "E",
        tone: "green",
        primary: true,
        onSelect: () => {
          game.equip(item);
          app.refresh();
          this.openInventory(game, app);
        },
      });
    }

    actions.push({
      label: "DROP",
      detail: `${item.kg} KG · FREES LOAD`,
      key: "D",
      tone: "yellow",
      onSelect: () => app.perform(() => game.drop_item(item)),
    });

    actions.push({
      label: "BACK",
      detail: "RETURN TO INVENTORY",
      key: "ESC",
      tone: "plain",
      onSelect: () => this.openInventory(game, app),
    });

    this.openContent({
      title: item.name,
      subtitle: `${item.kg} KG · ${CATEGORY_LABEL[item.category] || item.category.toUpperCase()}`,
      body: `
        <div class="item-hero">
          <span class="big-glyph" style="color:${color(item.color)}">${esc(item.glyph)}</span>
          <div>
            <p>${esc(item_detail(item))}</p>
            ${
              item.category === "slate"
                ? "<p class='muted'>LEVE O SLATE ATÉ UMA PORTA TRANCADA E ANDE CONTRA ELA.</p>"
                : ""
            }
          </div>
        </div>`,
      actions,
    });
  },

  openRomChoice(rom, game, app) {
    const actions = game.player.roms.map((old) => ({
      label: `OVERWRITE ${old.name}`,
      detail: old.desc,
      tone: "red",
      onSelect: () => app.perform(() => game.overwrite_rom(old, rom)),
    }));
    actions.push({
      label: "LEAVE IT",
      detail: "KEEP THE ROM ON THE FLOOR",
      tone: "plain",
      key: "ESC",
      onSelect: () => {},
    });

    this.openContent({
      title: "NO FREE ROM SLOT",
      subtitle: `READING ${rom.name} — ${rom.desc}`,
      body: `<p class="muted">ESCOLHA QUAL ROM SUBSTITUIR. O EFEITO DA ROM ANTIGA PERMANECE, MAS O PESO DELA SAI.</p>`,
      actions,
    });
  },

  // ------------------------------------------------------------------ telas
  openHelp() {
    this.openContent({
      title: "ECOS '94 — HELP",
      subtitle: "TODA INFORMAÇÃO TEM PREÇO EM RUÍDO",
      body: `
        <div class="help">
          <h3>MOVEMENT</h3>
          <p><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> or the D-PAD. Andar num monstro ataca.</p>

          <h3>INTERACT</h3>
          <p>O botão <b>INTERACT</b> abre as ações do que está sob você e ao redor: pegar item, ler ROM, abrir/trancar/arrombar porta, pingar o sonar, medir com o RULER, esperar, resetar o setor.</p>

          <h3>INVENTORY</h3>
          <p><b>INVENTORY</b> lista o que você carrega. Toque em um item para usar, equipar ou largar. Armas e armaduras no chão são equipadas automaticamente se forem melhores.</p>

          <h3>SONAR vs RULER</h3>
          <p><b>PING</b> revela um círculo e custa 30 de ruído. <b>RULER</b> dispara um feixe reto por 1 tile de cada vez e custa só 2 — a alternativa silenciosa.</p>

          <h3>DOORS</h3>
          <p>Portas trancadas pedem a senha de um <b>SLATE</b>. Forçar três vezes dispara um <b>PURGE</b>: a porta explode e dois monstros nascem.</p>

          <h3>LOAD &amp; ROMs</h3>
          <p>Peso define o ruído de cada passo. ROMs são permanentes, ocupam 1 dos 3 slots e competem pelo mesmo peso.</p>

          <h3>KEYBOARD</h3>
          <p><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> mover · <kbd>S</kbd> ping · <kbd>M</kbd> ruler · <kbd>L</kbd>/<kbd>U</kbd> trancar/destrancar · <kbd>B</kbd> arrombar · <kbd>G</kbd> pegar · <kbd>I</kbd> inventário · <kbd>X</kbd> reset · <kbd>.</kbd> esperar · <kbd>Enter</kbd> interact · <kbd>Esc</kbd> menu</p>

          <p class="muted">A seed é o save: mesma seed, mesmo mapa, mesmo loot, mesma IA.</p>
        </div>`,
      actions: [
        {
          label: "CLOSE",
          detail: "BACK TO THE DARK",
          key: "ESC",
          tone: "green",
          primary: true,
          onSelect: () => {},
        },
      ],
      wide: true,
    });
  },

  openHistory(game) {
    const lines = game.messages.slice(-40);
    const body = `<ol class="history">${lines
      .map(
        ([text, fg]) =>
          `<li style="color:${color(fg, 0.95)}">${esc(text)}</li>`
      )
      .join("")}</ol>`;
    this.openContent({
      title: "SYSTEM LOG",
      subtitle: `${game.messages.length} MESSAGES`,
      body,
      actions: [
        {
          label: "CLOSE",
          detail: "BACK TO THE SECTOR",
          key: "ESC",
          tone: "plain",
          onSelect: () => {},
        },
      ],
      wide: true,
    });
  },

  openMenu(game, app) {
    const options = app.options;
    const actions = [
      {
        label: "RESUME",
        detail: "BACK TO THE SECTOR",
        key: "ESC",
        tone: "green",
        primary: true,
        onSelect: () => {},
      },
      {
        label: `COLOR: ${(options.phosphor || "VGA 16").toUpperCase()}`,
        detail: "CICLA VGA · VERDE · ÂMBAR · BRANCO",
        tone: "cyan",
        onSelect: () => {
          app.cycleOption("phosphor");
          this.openMenu(game, app);
        },
      },
      {
        label: `SCANLINES: ${options.scanlines ? "ON" : "OFF"}`,
        detail: "LINHAS DE VARREDURA DO CRT",
        tone: "cyan",
        onSelect: () => {
          app.cycleOption("scanlines");
          this.openMenu(game, app);
        },
      },
      {
        label: `SOUND: ${options.sound ? "ON" : "OFF"}`,
        detail: "PC SPEAKER SINTETIZADO",
        tone: "cyan",
        onSelect: () => {
          app.cycleOption("sound");
          this.openMenu(game, app);
        },
      },
      {
        label: "HOW TO PLAY",
        detail: "CONTROLS AND SYSTEMS",
        tone: "plain",
        onSelect: () => this.openHelp(),
      },
      {
        label: "QUIT TO TITLE",
        detail: "A RUN NÃO É SALVA",
        key: "Q",
        tone: "red",
        danger: true,
        onSelect: () => app.toTitle(),
      },
    ];

    this.openContent({
      title: "PAUSED",
      subtitle: `SEED ${game.seed} · SECTOR ${game.depth} · TURN ${game.turn}`,
      actions,
    });
  },

  openSeed(current, onStart) {
    let input = null;
    const parseSeed = () => {
      const value = Number.parseInt(input ? input.value : "", 10);
      return Number.isFinite(value) ? value >>> 0 : current;
    };

    this.openContent({
      title: "ENTER SEED",
      subtitle: "MESMA SEED, MESMO MAPA, MESMO LOOT",
      body: `
        <label class="seed-field">
          <span>SEED (0 – 4294967295)</span>
          <input id="seed-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${current}">
        </label>`,
      actions: [
        {
          label: "START RUN",
          detail: "USE THIS SEED",
          tone: "green",
          primary: true,
          onSelect: () => onStart(parseSeed()),
        },
        {
          label: "RANDOM",
          detail: "LET THE SYSTEM CHOOSE",
          tone: "cyan",
          onSelect: () => onStart(null),
        },
        {
          label: "CANCEL",
          key: "ESC",
          tone: "plain",
          onSelect: () => {},
        },
      ],
    });
    input = document.getElementById("seed-input");
    if (input) {
      input.focus();
      input.select();
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          const value = parseSeed();
          this.close();
          onStart(value);
        }
      });
    }
  },

  openGameOver(game, app) {
    const player = game.player;
    const victory = game.victory;
    const body = `
      <div class="stats big">
        <div><span>SECTOR</span><b>${game.depth} / ${MAX_DEPTH}</b></div>
        <div><span>TURNS</span><b>${player.turns}</b></div>
        <div><span>KILLS</span><b>${player.kills}</b></div>
        <div><span>PEAK NOISE</span><b>${player.peak_noise}</b></div>
        <div><span>RESETS</span><b>${player.resets}</b></div>
        <div><span>ALERT</span><b>${player.alert}</b></div>
        <div><span>LOAD</span><b>${player.load} / ${player.capacity}</b></div>
      </div>
      <div class="section">
        <h3>ROMS READ</h3>
        <p>${player.roms.map((rom) => esc(rom.name)).join(", ") || "NONE"}</p>
      </div>
      <p class="seed-line">SEED <b>${game.seed}</b></p>`;

    const actions = [
      {
        label: "NEW RUN",
        detail: "NOVA SEED, NOVO SISTEMA",
        tone: "green",
        primary: true,
        onSelect: () => app.startRun(null),
      },
      {
        label: "RETRY THIS SEED",
        detail: `SEED ${game.seed}`,
        tone: "cyan",
        onSelect: () => app.startRun(game.seed),
      },
      {
        label: "TITLE",
        detail: "VOLTAR AO MENU",
        tone: "plain",
        onSelect: () => app.toTitle(),
      },
    ];

    this.openContent({
      title: victory ? "ECOS RECLAIMED" : "RUN TERMINATED",
      subtitle: game.cause || "THE DARK TOOK YOU",
      body,
      actions,
      wide: true,
      locked: true,
    });
  },

  // -------------------------------------------------------------- efeitos
  ripple(x, y, cell) {
    const node = document.createElement("span");
    node.className = "ripple";
    const size = Math.max(12, cell);
    node.style.left = `${x - size / 2}px`;
    node.style.top = `${y - size / 2}px`;
    node.style.width = `${size}px`;
    node.style.height = `${size}px`;
    node.style.setProperty("--ripple-scale", `${10 + size / 10}`);
    refs.ripple.appendChild(node);
    node.addEventListener("animationend", () => node.remove());
  },

  flash() {
    refs.stage.classList.remove("hit");
    // Forca reflow para reiniciar a animacao.
    void refs.stage.offsetWidth;
    refs.stage.classList.add("hit");
  },

  bootLine(text) {
    refs["boot-text"].textContent += `${text}\n`;
  },

  showBoot(show) {
    refs.boot.classList.toggle("hidden", !show);
  },

  setTitleSeed(seed) {
    refs["title-seed"].textContent = `LAST SEED: ${seed}`;
  },

  titleHTML(lines) {
    refs.logo.textContent = lines.join("\n");
  },
};

export { refs };
