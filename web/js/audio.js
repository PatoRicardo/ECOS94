/**
 * Audio: efeitos sintetizados com WebAudio.
 *
 * Nao ha arquivos de som: as ondas sao geradas em runtime, como o PC
 * speaker do original. O contexto so nasce no primeiro gesto do usuario,
 * respeitando a politica de autoplay dos navegadores.
 */

let ctx = null;
let master = null;
let muted = false;

function ensure_context() {
  if (typeof window === "undefined") return null;
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.28;
  master.connect(ctx.destination);
  return ctx;
}

function tone({ type = "square", from, to = null, dur = 0.1, volume = 0.5 }) {
  if (muted) return;
  const audio = ensure_context();
  if (!audio) return;

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, from), now);
  if (to !== null && to !== from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + dur);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

const SFX = {
  ping: () => tone({ type: "sine", from: 1800, to: 300, dur: 0.42, volume: 0.5 }),
  hit: () => tone({ type: "square", from: 220, dur: 0.07, volume: 0.45 }),
  pickup: () => tone({ type: "sine", from: 500, to: 1500, dur: 0.14, volume: 0.4 }),
  rom: () => tone({ type: "sine", from: 700, to: 2200, dur: 0.28, volume: 0.4 }),
  error: () => tone({ type: "square", from: 130, dur: 0.16, volume: 0.5 }),
  door: () => tone({ type: "square", from: 88, dur: 0.1, volume: 0.45 }),
  step: () => tone({ type: "square", from: 96, dur: 0.03, volume: 0.25 }),
  death: () => tone({ type: "sine", from: 430, to: 55, dur: 0.95, volume: 0.55 }),
  win: () => tone({ type: "sine", from: 400, to: 1800, dur: 0.7, volume: 0.5 }),
};

export function play(name) {
  const fn = SFX[name];
  if (fn) fn();
}

export function setMuted(value) {
  muted = Boolean(value);
}

export function isMuted() {
  return muted;
}

/** Precisa ser chamado dentro de um gesto para liberar o audio. */
export function unlock() {
  ensure_context();
}

export const sfx = {
  ping: () => play("ping"),
  hit: () => play("hit"),
  pickup: () => play("pickup"),
  rom: () => play("rom"),
  error: () => play("error"),
  door: () => play("door"),
  step: () => play("step"),
  blip: () => play("pickup"),
  death: () => play("death"),
  win: () => play("win"),
};
