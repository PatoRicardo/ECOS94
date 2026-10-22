"""Audio: efeitos de PC speaker sintetizados em memoria.

Nao ha arquivos de som: as amostras sao geradas em runtime e tocadas de
forma assincrona, para nunca travar o loop do jogo.
"""

from __future__ import annotations

import io
import math
import struct
import wave

try:  # pragma: no cover - apenas no Windows
    import winsound
except Exception:  # pragma: no cover
    winsound = None

RATE = 22050
MUTED = False

_cache: dict[str, bytes] = {}


def _wav_bytes(samples) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        frames = bytearray()
        for value in samples:
            clipped = max(-32768, min(32767, int(value)))
            frames += struct.pack("<h", clipped)
        handle.writeframes(bytes(frames))
    return buffer.getvalue()


def _square(freq: float, dur: float, volume: float = 0.20):
    """Onda quadrada: o som classico do alto-falante do PC."""
    total = int(RATE * dur)
    period = RATE / max(1.0, freq)
    out = []
    for i in range(total):
        out.append(32767 * volume * (1 if (i % period) < period / 2 else -1))
    return out


def _sweep(f0: float, f1: float, dur: float, volume: float = 0.30):
    """Varredura senoidal: o eco do sonar."""
    total = int(RATE * dur)
    out = []
    phase = 0.0
    for i in range(total):
        t = i / max(1, total - 1)
        freq = f0 + (f1 - f0) * t
        phase += 2 * math.pi * freq / RATE
        envelope = 1.0 - 0.55 * t
        out.append(32767 * volume * envelope * math.sin(phase))
    return out


def _sound(name: str) -> bytes | None:
    if name in _cache:
        return _cache[name]
    if name == "ping":
        data = _wav_bytes(_sweep(1800, 300, 0.42))
    elif name == "hit":
        data = _wav_bytes(_square(220, 0.07))
    elif name == "pickup":
        data = _wav_bytes(_sweep(500, 1500, 0.14))
    elif name == "rom":
        data = _wav_bytes(_sweep(700, 2200, 0.28))
    elif name == "error":
        data = _wav_bytes(_square(130, 0.16))
    elif name == "door":
        data = _wav_bytes(_square(88, 0.10))
    elif name == "step":
        data = _wav_bytes(_square(96, 0.03, 0.12))
    elif name == "death":
        data = _wav_bytes(_sweep(430, 55, 0.95))
    elif name == "win":
        data = _wav_bytes(_sweep(400, 1800, 0.7))
    else:
        return None
    _cache[name] = data
    return data


def play(name: str) -> None:
    """Toca um efeito. Nao bloqueia."""
    if winsound is None or MUTED:
        return
    data = _sound(name)
    if data is None:
        return
    try:
        winsound.PlaySound(data, winsound.SND_MEMORY | winsound.SND_ASYNC)
    except Exception:
        pass


def ping() -> None:
    play("ping")


def hit() -> None:
    play("hit")


def pickup() -> None:
    play("pickup")


def rom() -> None:
    play("rom")


def error() -> None:
    play("error")


def door() -> None:
    play("door")


def step() -> None:
    play("step")


def blip() -> None:
    play("pickup")


def death() -> None:
    play("death")


def win() -> None:
    play("win")
