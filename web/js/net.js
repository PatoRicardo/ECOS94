/**
 * Transporte P2P (PeerJS). Sem servidor proprio e sem banco: o broker
 * publico apenas troca a sinalizacao WebRTC; o host e autoritativo.
 */

import { MAX_PLAYERS } from "./data.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PREFIX = "ecos94-v2-";

export function makeCode(length = 5) {
  let code = "";
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  } else {
    for (let i = 0; i < length; i += 1) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  }
  return code;
}

export function roomLink(code) {
  try {
    return `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`;
  } catch {
    return `?room=${code}`;
  }
}

export class Net {
  constructor() {
    this.peer = null;
    this.code = null;
    this.role = null;
    this.conns = new Map(); // playerId -> DataConnection
    this.connPlayer = new Map();
    this.handlers = {};
    this.name = "";
    this.closed = false;
  }

  on(type, handler) {
    this.handlers[type] = handler;
    return this;
  }

  emit(type, payload) {
    const handler = this.handlers[type];
    if (!handler) return undefined;
    return handler(payload);
  }

  _peerOptions() {
    return {
      debug: 1,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
      },
    };
  }

  async host(name) {
    this.role = "host";
    this.name = name;
    if (!window.Peer) throw new Error("PEERJS NAO CARREGADO");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = makeCode();
      try {
        await this._openHost(code);
        this.code = code;
        return code;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    throw new Error("NAO FOI POSSIVEL ABRIR A SALA");
  }

  _openHost(code) {
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(PREFIX + code, this._peerOptions());
      this.peer = peer;
      let settled = false;
      peer.on("open", () => {
        settled = true;
        this.emit("open", { code });
        resolve();
      });
      peer.on("error", (error) => {
        if (!settled) reject(error);
        else this.emit("error", error);
      });
      peer.on("connection", (conn) => this._accept(conn));
      peer.on("disconnected", () => this.emit("signal-lost"));
    });
  }

  _accept(conn) {
    conn.on("data", (data) => this._fromConn(conn, data));
    conn.on("close", () => {
      const playerId = this.connPlayer.get(conn);
      this.conns.delete(playerId);
      this.connPlayer.delete(conn);
      this.emit("leave", { playerId });
    });
    conn.on("error", () => {});
  }

  _fromConn(conn, data) {
    let message = data;
    if (typeof message === "string") {
      try {
        message = JSON.parse(message);
      } catch {
        return;
      }
    }
    if (!message || typeof message !== "object") return;
    if (message.t === "hello") {
      if (this.conns.size >= MAX_PLAYERS - 1) {
        this.sendRaw(conn, { t: "full" });
        setTimeout(() => conn.close(), 200);
        return;
      }
      const playerId = this.emit("hello", {
        conn,
        name: String(message.name || "OPERATOR").slice(0, 12),
      });
      if (playerId === undefined || playerId === null) {
        this.sendRaw(conn, { t: "full" });
        setTimeout(() => conn.close(), 200);
        return;
      }
      this.conns.set(playerId, conn);
      this.connPlayer.set(conn, playerId);
      this.send(playerId, { t: "welcome", code: this.code, playerId });
      return;
    }
    const playerId = this.connPlayer.get(conn);
    if (playerId === undefined) return;
    this.emit("message", { playerId, message });
  }

  async join(code, name) {
    this.role = "client";
    this.name = name;
    if (!window.Peer) throw new Error("PEERJS NAO CARREGADO");
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(null, this._peerOptions());
      this.peer = peer;
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) reject(new Error("TIMEOUT AO CONECTAR"));
      }, 12000);
      peer.on("error", (error) => {
        if (!settled) {
          clearTimeout(timer);
          reject(error);
        } else {
          this.emit("error", error);
        }
      });
      peer.on("open", () => {
        const conn = peer.connect(PREFIX + code, {
          reliable: true,
          serialization: "json",
        });
        this.conn = conn;
        conn.on("open", () => {
          settled = true;
          clearTimeout(timer);
          this.sendRaw(conn, { t: "hello", name });
          resolve();
        });
        conn.on("data", (data) => {
          let message = data;
          if (typeof message === "string") {
            try {
              message = JSON.parse(message);
            } catch {
              return;
            }
          }
          this.emit("message", { message });
        });
        conn.on("close", () => this.emit("leave", {}));
        conn.on("error", (error) => this.emit("error", error));
      });
    });
  }

  sendRaw(conn, payload) {
    try {
      conn.send(payload);
    } catch {
      /* conexao fechada */
    }
  }

  send(playerId, payload) {
    const conn = this.conns.get(playerId);
    if (conn) this.sendRaw(conn, payload);
  }

  broadcast(payload) {
    for (const [playerId] of this.conns) this.send(playerId, payload);
  }

  sendToHost(payload) {
    if (this.conn) this.sendRaw(this.conn, payload);
  }

  close() {
    this.closed = true;
    try {
      if (this.conn) this.conn.close();
      if (this.peer) this.peer.destroy();
    } catch {
      /* ignore */
    }
    this.conns.clear();
    this.connPlayer.clear();
  }
}
