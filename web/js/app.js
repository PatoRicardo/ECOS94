/**
 * ECOS '94 — WEB
 *
 * Ponto de entrada: boot falso de BIOS, menu de titulo, loop de jogo e
 * ligacao entre teclado/toque, o estado (Game) e a interface.
 */

import { play, setMuted, unlock } from "./audio.js";
import { build_context, context_subtitle } from "./context.js";
import { MAX_PLAYERS } from "./data.js";
import { Game } from "./game.js";
import { PROLOGUE, prologuePage } from "./lore.js";
import { Net, roomLink } from "./net.js";
import {
  ClientGame,
  serialize_snapshot,
  serialize_state,
} from "./protocol.js";
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
  net: null,
  role: "solo", // solo | host | client
  lobby: [],
  lobbyCode: null,
  lobbyHostName: "",
  lobbyStarted: false,
  _lastDepth: 0,
  _lastLevel: null,
  _netToGame: new Map(),

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
        key: "P",
        label: "HOST CO-OP · 2–5",
        meta: "CRIA UMA SALA E COMPARTILHA O CÓDIGO",
        run: () => this.hostCoop(),
      },
      {
        key: "J",
        label: "JOIN ROOM",
        meta: "ENTRA POR CÓDIGO OU LINK",
        run: () => this.joinCoop(),
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
    this.stopParty();
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

  // ------------------------------------------------------------- co-op
  stopParty() {
    if (this.net) this.net.close();
    this.net = null;
    this.role = "solo";
    this.lobby = [];
    this.lobbyCode = null;
    this.lobbyStarted = false;
    this._clientDepth = new Map();
    this._netToGame = new Map();
    this._nextNetId = 1;
    this._lastLevel = null;
  },

  async hostCoop() {
    const name = (window.prompt("CALLSIGN (HOST)", "OPERATOR") || "").trim();
    if (!name) return;
    this.stopParty();
    this.role = "host";
    this.lobby = [{ name: name.slice(0, 12), id: 0 }];
    this.lobbyHostName = name.slice(0, 12);
    const net = new Net();
    this.net = net;
    this._clientDepth = new Map();
    this._nextNetId = 1;
    this._netToGame = new Map([[0, 0]]);
    net.on("hello", ({ name: clientName }) => {
      if (this.lobbyStarted && this.game) {
        if (this.game.players.length >= MAX_PLAYERS) return null;
        const player = this.game.add_player(clientName);
        if (!player) return null;
        const netId = this._nextNetId++;
        this._netToGame.set(netId, player.id);
        this.lobby.push({ name: player.name, id: netId });
        setTimeout(() => {
          this.sendToPlayer(netId, true);
          this.refresh();
          this.syncParty();
        }, 80);
        return netId;
      }
      if (this.lobby.length >= MAX_PLAYERS) return null;
      const id = this._nextNetId++;
      this.lobby.push({ name: clientName, id });
      setTimeout(() => this.broadcastLobby(), 20);
      return id;
    });
    net.on("message", ({ playerId, message }) => {
      if (message.t === "intent") this.receiveIntent(playerId, message.intent);
    });
    net.on("leave", ({ playerId }) => {
      const gameId = this._netToGame.get(playerId);
      if (this.game && this.lobbyStarted && gameId !== undefined) {
        this.game.remove_player(gameId);
      }
      this._netToGame.delete(playerId);
      this.lobby = this.lobby.filter((entry) => entry.id !== playerId);
      this.broadcastLobby();
      this.refresh();
      this.syncParty();
    });
    net.on("error", (error) => this.partyError(error));
    try {
      const code = await net.host(name.slice(0, 12));
      this.lobbyCode = code;
      this.showLobby();
    } catch (error) {
      this.stopParty();
      this.partyError(error);
    }
  },

  async joinCoop() {
    const params = new URLSearchParams(location.search);
    const code = (window.prompt(
      "ROOM CODE",
      (params.get("room") || "").toUpperCase()
    ) || "").trim().toUpperCase();
    if (!code) return;
    const name = (window.prompt("CALLSIGN", "OPERATOR") || "").trim();
    if (!name) return;
    this.stopParty();
    this.role = "client";
    const net = new Net();
    this.net = net;
    net.on("message", ({ message }) => this.clientMessage(message));
    net.on("leave", () => this.partyError("HOST DESCONECTOU."));
    net.on("error", (error) => this.partyError(error));
    this.showConnecting(code);
    try {
      await net.join(code, name.slice(0, 12));
      this.lobbyCode = code;
    } catch (error) {
      this.stopParty();
      this.partyError(error);
    }
  },

  partyError(error) {
    const text = String(error && error.message ? error.message : error || "ERRO");
    ui.openContent({
      title: "CONNECTION ERROR",
      subtitle: text.toUpperCase(),
      body: "<p class='muted'>SOLO CONTINUA DISPONÍVEL NO MENU. VERIFIQUE O CÓDIGO E A INTERNET.</p>",
      actions: [
        {
          label: "BACK TO TITLE",
          key: "ESC",
          tone: "plain",
          onSelect: () => app.toTitle(),
        },
      ],
    });
  },

  showConnecting(code) {
    ui.openContent({
      title: "CONNECTING",
      subtitle: `ROOM ${code} · WEBRTC`,
      body: `<p class="muted">AGUARDANDO O HOST. O BROKER PÚBLICO FAZ SÓ A SINALIZAÇÃO; NENHUM BANCO É USADO.</p>`,
      actions: [
        {
          label: "CANCEL",
          key: "ESC",
          tone: "plain",
          onSelect: () => app.toTitle(),
        },
      ],
    });
  },

  showLobby() {
    if (!this.lobbyCode) return;
    ui.openLobby({
      code: this.lobbyCode,
      link: roomLink(this.lobbyCode),
      players: this.lobby,
      max: MAX_PLAYERS,
      host: true,
      onStart: () => this.startCoop(),
      onCopy: () => this.copyRoomLink(),
      onClose: () => this.toTitle(),
    });
  },

  clientLobby(message) {
    this.lobby = message.players || [];
    if (message.started || this.lobbyStarted) return;
    ui.openLobby({
      code: this.lobbyCode,
      link: roomLink(this.lobbyCode || ""),
      players: this.lobby,
      max: MAX_PLAYERS,
      host: false,
      onClose: () => this.toTitle(),
    });
  },

  broadcastLobby() {
    if (this.role !== "host" || !this.net || this.lobbyStarted) return;
    this.net.broadcast({
      t: "lobby",
      players: this.lobby,
      started: false,
      code: this.lobbyCode,
    });
    if (ui.overlayOpen && !this.lobbyStarted) this.showLobby();
  },

  async copyRoomLink() {
    const link = roomLink(this.lobbyCode || "");
    try {
      await navigator.clipboard.writeText(link);
      ui.setHint("LINK COPIADO.");
    } catch {
      window.prompt("COPIE O LINK DA SALA", link);
    }
  },

  startCoop() {
    if (this.role !== "host" || !this.lobby.length) return;
    const seed = random_seed();
    const roster = this.lobby.map((entry) => ({ name: entry.name }));
    this.game = new Game(seed, {
      players: roster,
      localId: 0,
      partyMode: true,
    });
    // ID da conexao -> ID do jogador dentro do Game (indice do roster).
    this._netToGame = new Map();
    this.lobby.forEach((entry, index) => {
      this._netToGame.set(entry.id, index);
    });
    this.options.lastSeed = seed;
    saveOptions(this.options);
    this.lobbyStarted = true;
    this.screen = "play";
    this._overShown = false;
    this._clientDepth = new Map();
    this._lastLevel = this.game.level;
    ui.close(true);
    ui.showScreen("game");
    this.refresh();
    if (this.net) {
      this.net.broadcast({ t: "started", seed });
      for (const [playerId] of this.net.conns) {
        this._clientDepth.set(playerId, -1);
        this.sendToPlayer(playerId, true);
      }
    }
  },

  sendToPlayer(playerId, snapshot = false) {
    if (!this.game || !this.net) return;
    const gameId = this._netToGame.get(playerId);
    if (gameId === undefined) return;
    const depth = this._clientDepth?.get(playerId);
    const needSnapshot = snapshot || depth !== this.game.depth;
    this.net.send(
      playerId,
      needSnapshot
        ? serialize_snapshot(this.game, gameId)
        : serialize_state(this.game, gameId)
    );
    this._clientDepth.set(playerId, this.game.depth);
  },

  syncParty() {
    if (this.role !== "host" || !this.net || !this.game) return;
    for (const [playerId] of this.net.conns) this.sendToPlayer(playerId);
  },

  receiveIntent(playerId, intent) {
    const game = this.game;
    if (!game || game.over || !intent) return;
    const gameId = this._netToGame.get(playerId);
    if (gameId === undefined) return;
    const player = game.players.find((entry) => entry.id === gameId);
    if (!player) return;
    const beforeHp = game.player.hp;
    try {
      switch (intent.a) {
        case "move":
          game.move(Number(intent.dx), Number(intent.dy), player);
          break;
        case "ping":
          game.ping(player);
          break;
        case "measure":
          game.measure(Number(intent.dx), Number(intent.dy), player);
          break;
        case "lock":
          game.lock_door(player);
          break;
        case "unlock":
          game.unlock_door(player);
          break;
        case "brute":
          game.brute_force(player);
          break;
        case "pickup":
          game.pickup(player);
          break;
        case "wait":
          game.wait(player);
          break;
        case "reset":
          game.reset_sector(player);
          break;
        case "read_rom": {
          const rom = game.level.roms_on_floor[Number(intent.index)];
          if (rom) {
            if (Number.isInteger(intent.overwrite) && player.roms[intent.overwrite]) {
              game.overwrite_rom(player.roms[intent.overwrite], rom, player);
            } else {
              game.read_rom(rom, player);
            }
          }
          break;
        }
        case "equip": {
          const item = player.inventory[Number(intent.index)];
          if (item) game.equip(item, player);
          break;
        }
        case "drop": {
          const item = player.inventory[Number(intent.index)];
          if (item) game.drop_item(item, player);
          break;
        }
        case "use": {
          const item = player.inventory[Number(intent.index)];
          if (item) game.use_item(item, player);
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error(error);
    }
    this.afterMutation(beforeHp);
  },

  clientMessage(message) {
    if (!message) return;
    const kind = message.t || message.type;
    if (kind === "full") {
      this.partyError("SALA CHEIA (5/5).");
      return;
    }
    if (kind === "welcome") {
      this.lobbyCode = message.code || this.lobbyCode;
      return;
    }
    if (kind === "lobby") {
      this.clientLobby(message);
      return;
    }
    if (kind === "started") {
      this.lobbyStarted = true;
      return;
    }
    if (kind === "snapshot") {
      this.game = new ClientGame(message, (intent) =>
        this.net?.sendToHost({ t: "intent", intent })
      );
      this.screen = "play";
      this._overShown = false;
      ui.close(true);
      ui.showScreen("game");
      this.refresh();
      return;
    }
    if (kind === "state" && this.game) {
      const hurt = this.game.applyState(message);
      if (hurt) ui.flash();
      this.refresh();
      this.afterClientState();
      return;
    }
    if (kind === "error") this.partyError(message.message || "ERRO");
  },

  afterClientState() {
    if (!this.game) return;
    if (this.game.over && !this._overShown) {
      this._overShown = true;
      ui.openGameOver(this.game, this);
      play(this.game.victory ? "win" : "death");
    }
  },

  sendIntent(intent) {
    if (this.role === "client" && this.net) {
      this.net.sendToHost({ t: "intent", intent });
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
    if (this.role === "host") {
      const levelChanged = this._lastLevel !== game.level;
      if (levelChanged) {
        for (const playerId of this.net ? this.net.conns.keys() : []) {
          this.sendToPlayer(playerId, true);
          this._clientDepth.set(playerId, game.depth);
        }
      } else {
        this.syncParty();
      }
      this._lastLevel = game.level;
    }
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
    if (key === "p") {
      this.hostCoop();
      return;
    }
    if (key === "j") {
      this.joinCoop();
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
