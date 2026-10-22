/**
 * ECOS '94 — WEB
 *
 * Ponto de entrada: boot falso de BIOS, menu de titulo, loop de jogo e
 * ligacao entre teclado/toque, o estado (Game) e a interface.
 */

import { play, setMuted, unlock } from "./audio.js";
import { build_context, context_subtitle } from "./context.js";
import { Game } from "./game.js";
import { PROLOGUE, prologuePage } from "./lore.js";
import { Renderer } from "./renderer.js";
import { random_seed } from "./rng.js";
import { PHOSPHOR_CYCLE, setMode } from "./theme.js";
import { ui } from "./ui.js";

const STORAGE_KEY = "ecos94.web.options.v1";

const BOOT_LINES = [
  "ECOS ROM v1.04  (c) 1994 ECOS SYSTEMS",
  "",
  "WEB TERMINAL .................. OK",
  "CANVAS RENDERER ............... OK",
  "SONAR ARRAY ................... OK",
  "RULER OPTICS .................. OK",
  "LOCK CONTROL .................. OK",
  "LOAD SENSORS .................. OK",
  "PASSWORD VAULT ................ OK",
  "RESET VECTOR .................. OK",
  "",
  "BOOTING SECTOR 1...",
];

const BIGFONT = {
  E: ["#####", "#....", "####.", "#....", "#####"],
  C: [".####", "#....", "#....", "#....", ".####"],
  O: [".###.", "#...#", "#...#", "#...#", ".###."],
  S: [".####", "#....", ".###.", "....#", "####."],
  9: [".###.", "#...#", ".####", "....#", ".###."],
  4: ["#..#.", "#..#.", "#####", "...#.", "...#."],
  "'": ["..#..", "..#..", ".....", ".....", "....."],
  " ": [".....", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", "#####", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", "..#.."],
};

function big_text(text) {
  const rows = ["", "", "", "", ""];
  for (const ch of text.toUpperCase()) {
    const glyph = BIGFONT[ch] || BIGFONT[" "];
    for (let i = 0; i < 5; i += 1) rows[i] += `${glyph[i]} `;
  }
  return rows.map((row) => row.replace(/\s+$/, ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampSeed(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.trunc(number) >>> 0;
}

function loadOptions() {
  const defaults = {
    phosphor: null,
    scanlines: true,
    sound: true,
    lastSeed: 0,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    return {
      ...defaults,
      ...saved,
      phosphor: PHOSPHOR_CYCLE.includes(saved.phosphor) ? saved.phosphor : null,
    };
  } catch {
    return defaults;
  }
}

function saveOptions(options) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    /* modo privado: segue sem persistir */
  }
}

function seedFromUrl() {
  return clampSeed(new URLSearchParams(location.search).get("seed"));
}

export const app = {
  game: null,
  options: loadOptions(),
  renderer: null,
  screen: "boot",
  _overShown: false,

  // --------------------------------------------------------------- init
  init() {
    this.renderer = new Renderer(document.getElementById("map"));
    ui.init(this);
    ui.setLogHandler(() => {
      if (this.game) ui.openHistory(this.game);
    });

    setMode(this.options.phosphor, this.options.scanlines);
    setMuted(!this.options.sound);
    this.buildTitleMenu();
    ui.setTitleSeed(this.options.lastSeed);
    ui.titleHTML(big_text("ECOS '94"));

    this.bindKeys();
    this.bindTouch();
    this.bindResize();
    this.boot();
  },

  async boot() {
    ui.showBoot(true);
    let skip = false;
    const skipNow = () => {
      skip = true;
    };
    window.addEventListener("pointerdown", skipNow, { once: true });
    window.addEventListener("keydown", skipNow, { once: true });

    for (const line of BOOT_LINES) {
      if (!skip) await sleep(line === "" ? 40 : 90);
      ui.bootLine(line);
    }
    if (!skip) await sleep(180);
    ui.showBoot(false);

    const urlSeed = seedFromUrl();
    if (urlSeed !== null) {
      this.startRun(urlSeed);
    } else {
      this.toTitle();
      this.showPrologue(0);
    }
  },

  // ------------------------------------------------------------- prologo
  /**
   * Abertura narrativa. O menu (H) reabre sempre do começo.
   * Fecha no ESC ou em SKIP, caindo no menu de titulo.
   */
  showPrologue(index = 0) {
    const page = prologuePage(index);
    if (!page) {
      this.toTitle();
      return;
    }
    const last = index === PROLOGUE.length - 1;
    ui.openContent({
      title: page.title,
      subtitle: page.subtitle,
      body: page.body,
      wide: true,
      actions: [
        {
          label: last ? "GO DOWN" : "NEXT",
          detail: last ? "THE WELL IS OPEN" : "NEXT PAGE",
          key: "ENTER",
          tone: "green",
          primary: true,
          onSelect: () => this.showPrologue(index + 1),
        },
        {
          label: "SKIP",
          detail: "BACK TO THE TITLE",
          key: "ESC",
          onSelect: () => this.toTitle(),
        },
      ],
    });
  },

  // -------------------------------------------------------------- titulo
  buildTitleMenu() {
    const menu = document.getElementById("title-menu");
    menu.innerHTML = "";

    const items = [
      {
        key: "N",
        label: "NEW RUN",
        meta: "DESÇA OS 10 SETORES",
        run: () => this.startRun(null),
      },
      {
        key: "S",
        label: "ENTER SEED",
        meta: "MESMA SEED, MESMO MAPA",
        run: () => ui.openSeed(this.options.lastSeed, (value) => this.startRun(value)),
      },
      {
        key: "C",
        label: `COLOR: ${(this.options.phosphor || "VGA 16").toUpperCase()}`,
        meta: "VGA · VERDE · ÂMBAR · BRANCO",
        run: () => {
          this.cycleOption("phosphor");
          this.buildTitleMenu();
        },
      },
      {
        key: "L",
        label: `SCANLINES: ${this.options.scanlines ? "ON" : "OFF"}`,
        meta: "LINHAS DO CRT",
        run: () => {
          this.cycleOption("scanlines");
          this.buildTitleMenu();
        },
      },
      {
        key: "M",
        label: `SOUND: ${this.options.sound ? "ON" : "OFF"}`,
        meta: "PC SPEAKER SINTETIZADO",
        run: () => {
          this.cycleOption("sound");
          this.buildTitleMenu();
        },
      },
      {
        key: "H",
        label: "LORE",
        meta: "A HISTÓRIA DO SUBSOLO",
        run: () => this.showPrologue(0),
      },
      {
        key: "?",
        label: "HOW TO PLAY",
        meta: "CONTROLES E SISTEMAS",
        run: () => ui.openHelp(),
      },
    ];

    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-item";
      button.innerHTML = `
        <span class="menu-key">${item.key}</span>
        <span class="menu-label">${item.label}</span>
        <span class="menu-meta">${item.meta}</span>`;
      button.addEventListener("click", () => {
        unlock();
        item.run();
      });
      menu.appendChild(button);
    }
  },

  toTitle() {
    this.game = null;
    this._overShown = false;
    this.screen = "title";
    ui.close(true);
    ui.showScreen("title");
    ui.setTitleSeed(this.options.lastSeed);
    this.buildTitleMenu();
    try {
      history.replaceState(null, "", location.pathname);
    } catch {
      /* file:// ou sandbox */
    }
  },

  // ---------------------------------------------------------------- run
  startRun(seed) {
    let value = clampSeed(seed);
    if (value === null) value = random_seed();

    unlock();
    this.options.lastSeed = value;
    saveOptions(this.options);

    this._overShown = false;
    this.game = new Game(value);
    this.screen = "play";

    ui.close(true);
    ui.showScreen("game");
    ui.setTitleSeed(value);
    this.refresh();

    try {
      history.replaceState(null, "", `?seed=${value}`);
    } catch {
      /* ignore */
    }
  },

  refresh() {
    if (!this.game) return;
    this.renderer.draw(this.game);
    ui.render(this.game);
  },

  /** Executa uma acao de jogo e atualiza tudo (dano, morte, som). */
  perform(fn) {
    if (!this.game || this.game.over) return;
    const beforeHp = this.game.player.hp;
    try {
      fn();
    } catch (error) {
      console.error(error);
      this.game.msg(`INTERNAL ERROR: ${error.message}`, 12);
    }
    this.afterMutation(beforeHp);
  },

  afterMutation(beforeHp) {
    const game = this.game;
    if (!game) return;
    if (game.player.hp < beforeHp) ui.flash();
    this.refresh();
    if (game.over && !this._overShown) {
      this._overShown = true;
      ui.openGameOver(game, this);
      play(game.victory ? "win" : "death");
    }
  },

  // ------------------------------------------------------------- acoes
  openInteract() {
    const game = this.game;
    if (!game || game.over) return;
    if (game.mode === "measure") game.mode = "play";

    const actions = build_context(game).map((action) => ({
      ...action,
      onSelect: () => this.runAction(action),
    }));

    ui.openSheet({
      title: "INTERACT",
      subtitle: context_subtitle(game),
      actions,
    });
  },

  runAction(action) {
    const game = this.game;
    if (!game || game.over) return;

    switch (action.id) {
      case "pickup":
        this.perform(() => game.pickup());
        break;
      case "read_rom":
        if (game.player.free_rom_slots > 0) {
          this.perform(() => game.read_rom(action.payload));
        } else {
          ui.openRomChoice(action.payload, game, this);
        }
        break;
      case "open_door":
        this.perform(() => game.move(action.payload.dx, action.payload.dy));
        break;
      case "lock_door":
        this.perform(() => game.lock_door());
        break;
      case "unlock_door":
        this.perform(() => game.unlock_door());
        break;
      case "brute_force":
        this.perform(() => game.brute_force());
        break;
      case "ping": {
        let pinged = false;
        this.perform(() => {
          pinged = game.ping();
        });
        if (pinged) {
          const pos = this.renderer.screen_pos(game.player.x, game.player.y);
          ui.ripple(pos.x, pos.y, pos.radius);
        }
        break;
      }
      case "measure":
        if (game.begin_measure()) this.refresh();
        break;
      case "wait":
        this.perform(() => game.wait());
        break;
      case "reset":
        ui.openContent({
          title: "RESET SECTOR?",
          subtitle: "ALERT +1 PERMANENTE · O SETOR INTEIRO É REGERADO",
          body: `<p class="muted">VOCÊ MANTÉM INVENTÁRIO, ROMS E HP. TODO MONSTRO DO SISTEMA FICA MAIS RÁPIDO E MAIS AUDÍVEL.</p>`,
          actions: [
            {
              label: "RESET",
              detail: "CUSTA ALERT +1",
              tone: "red",
              danger: true,
              primary: true,
              onSelect: () => this.perform(() => game.reset_sector()),
            },
            {
              label: "CANCEL",
              detail: "VOLTAR AO SETOR",
              key: "ESC",
              tone: "plain",
              onSelect: () => {},
            },
          ],
        });
        break;
      case "help":
        ui.openHelp();
        break;
      default:
        break;
    }
  },

  move(dx, dy) {
    const game = this.game;
    if (!game || game.over) return;
    if (game.mode === "measure") {
      this.perform(() => game.measure(dx, dy));
      return;
    }
    this.perform(() => game.move(dx, dy));
  },

  // ------------------------------------------------------------- opcoes
  cycleOption(key) {
    if (key === "phosphor") {
      const index = PHOSPHOR_CYCLE.indexOf(this.options.phosphor);
      this.options.phosphor = PHOSPHOR_CYCLE[(index + 1) % PHOSPHOR_CYCLE.length];
    } else if (key === "scanlines") {
      this.options.scanlines = !this.options.scanlines;
    } else if (key === "sound") {
      this.options.sound = !this.options.sound;
    }
    this.applyOptions();
  },

  applyOptions() {
    setMode(this.options.phosphor, this.options.scanlines);
    setMuted(!this.options.sound);
    if (this.options.sound) unlock();
    saveOptions(this.options);
    this.refresh();
  },

  // -------------------------------------------------------------- input
  bindKeys() {
    window.addEventListener("keydown", (event) => {
      unlock();

      // Painel aberto: Esc fecha, Enter deixa o botao focado agir.
      if (ui.isOpen()) {
        if (event.key === "Escape") {
          event.preventDefault();
          ui.close();
        }
        return;
      }

      if (this.screen === "title") {
        this.titleKey(event);
        return;
      }
      if (this.screen !== "play" || !this.game) return;
      this.gameKey(event);
    });
  },

  titleKey(event) {
    const key = event.key.toLowerCase();
    if (key === "n") {
      this.startRun(null);
      return;
    }
    if (key === "s") {
      ui.openSeed(this.options.lastSeed, (value) => this.startRun(value));
      return;
    }
    if (key === "c" || key === "l" || key === "m") {
      this.cycleOption(
        key === "c" ? "phosphor" : key === "l" ? "scanlines" : "sound"
      );
      this.buildTitleMenu();
      return;
    }
    if (event.key === "?") ui.openHelp();
    if (key === "h") this.showPrologue(0);
  },

  gameKey(event) {
    const game = this.game;
    if (!game) return;

    const arrows = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };

    if (game.mode === "measure") {
      if (event.key === "Escape") {
        event.preventDefault();
        game.mode = "play";
        this.refresh();
        return;
      }
      const delta = arrows[event.key];
      if (delta) {
        event.preventDefault();
        if (!event.repeat) this.perform(() => game.measure(delta[0], delta[1]));
      }
      return;
    }

    if (event.repeat) return;

    const delta = arrows[event.key];
    if (delta) {
      event.preventDefault();
      this.move(delta[0], delta[1]);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.openInteract();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      ui.openMenu(game, this);
      return;
    }

    if (event.key.length !== 1) return;

    const beforeHp = game.player.hp;
    let result = "ok";
    try {
      result = game.handle_key("char", event.key);
    } catch (error) {
      console.error(error);
      game.msg(`INTERNAL ERROR: ${error.message}`, 12);
    }
    if (result === "inventory") {
      ui.openInventory(game, this);
    } else if (result === "drop") {
      ui.openInventory(game, this, { dropMode: true });
    } else if (result === "help") {
      ui.openHelp();
    } else if (result === "title") {
      ui.openMenu(game, this);
    } else {
      this.afterMutation(beforeHp);
    }
  },

  bindTouch() {
    const interact = document.getElementById("btn-interact");
    const inventory = document.getElementById("btn-inventory");
    const menu = document.getElementById("btn-menu");

    menu.addEventListener("click", (event) => {
      event.preventDefault();
      unlock();
      if (!this.game) return;
      ui.openMenu(this.game, this);
    });

    interact.addEventListener("click", (event) => {
      event.preventDefault();
      unlock();
      this.openInteract();
    });

    inventory.addEventListener("click", (event) => {
      event.preventDefault();
      unlock();
      if (!this.game || this.game.over) return;
      if (this.game.mode === "measure") this.game.mode = "play";
      ui.openInventory(this.game, this);
    });

    const dirs = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };

    for (const button of document.querySelectorAll("[data-dir]")) {
      const [dx, dy] = dirs[button.dataset.dir];
      this.bindHold(button, () => this.move(dx, dy));
    }
  },

  /** Toque com repeticao suave: 1 passo, pausa, depois passos continuos. */
  bindHold(element, fn) {
    let delay = null;
    let interval = null;

    const stop = () => {
      if (delay) clearTimeout(delay);
      if (interval) clearInterval(interval);
      delay = null;
      interval = null;
      element.classList.remove("pressed");
    };

    const start = (event) => {
      event.preventDefault();
      unlock();
      if (!this.game || this.game.over) return;
      element.classList.add("pressed");
      fn();
      delay = setTimeout(() => {
        interval = setInterval(() => {
          if (!this.game || this.game.over) {
            stop();
            return;
          }
          fn();
        }, 170);
      }, 380);
    };

    element.addEventListener("pointerdown", start);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
    element.addEventListener("pointerleave", stop);
    element.addEventListener("contextmenu", (event) => event.preventDefault());
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fn();
      }
    });
  },

  bindResize() {
    const stage = document.getElementById("stage");
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => this.refresh());
      observer.observe(stage);
    }
    window.addEventListener("resize", () => this.refresh());
    window.addEventListener("orientationchange", () =>
      setTimeout(() => this.refresh(), 160)
    );
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.refresh();
    });
  },
};

// Debug/console: window.ECOS94.game, .startRun(...)
window.ECOS94 = app;

app.init();

export default app;
