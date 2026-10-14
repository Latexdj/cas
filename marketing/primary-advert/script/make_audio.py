"""Builds the advert's soundtrack: an original synthesized music bed, the
voiceover placed on its timeline, quiet UI sounds at the recorded clicks
and key presses, and soft swooshes at scene changes. The music ducks under
the voice. Output: build/audio/mix.wav (48 kHz stereo, about -14 LUFS).

Usage: python make_audio.py
"""
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
SR = 48000
rng = np.random.default_rng(23)

TL = json.loads((BUILD / "vo" / "timeline.json").read_text())
DATA = json.loads((ROOT / "video" / "src" / "data.json").read_text())
DUR = TL["duration"] + 0.5
N = int(DUR * SR)
scene = {s["id"]: s for s in TL["scenes"]}

BPM = 98
BEAT = 60 / BPM
BAR = 4 * BEAT
GROOVE_IN = scene["intro"]["start"] - 0.25          # drums and plucks enter on "With CAS"
GROOVE_OUT = scene["cta"]["start"] + 9.5            # groove drops out under the phone number
END_CHORD = GROOVE_OUT


def midi(n):
    return 440.0 * 2 ** ((n + 2 - 69) / 12)  # up a tone from the original D major: E major


# D major: Dmaj7 - Bm7 - Gmaj9 - Asus4, two bars each.
CHORDS = [
    (50, [62, 66, 69, 73]),  # D: D F# A C#
    (47, [59, 62, 66, 69]),  # Bm7: B D F# A
    (43, [59, 62, 66, 69, 57]),  # Gmaj9: B D F# A (+A low)
    (45, [57, 62, 64, 69]),  # Asus4: A D E A
]


def chord_at(t):
    return CHORDS[int(t // (2 * BAR)) % len(CHORDS)]


def env_adsr(n, a, r):
    e = np.ones(n)
    ai, ri = int(a * SR), int(r * SR)
    e[:ai] = np.linspace(0, 1, ai)
    if ri:
        e[-ri:] *= np.linspace(1, 0, ri)
    return e


def add(buf, start, sig, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * gain * l
    buf[i:i + len(sig), 1] += sig * gain * r


def pad_voice(f, dur):
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for det in (-0.12, 0.0, 0.11):
        ff = f * 2 ** (det / 12)
        for h in range(1, 9):
            out += np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28)) / (h ** 1.6)
    return out / 6


def pluck(f, dur=1.4):
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for h in range(1, 7):
        out += np.sin(2 * np.pi * f * h * t) * np.exp(-t * (3.5 + 2.6 * h)) / h
    return out * np.minimum(1, t / 0.003)


def bass(f, dur):
    t = np.arange(int(dur * SR)) / SR
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return s * np.exp(-t * 1.8) * np.minimum(1, t / 0.01)


def kick():
    t = np.arange(int(0.32 * SR)) / SR
    f = 45 + 75 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def noise_burst(dur, decay, hp=True):
    n = rng.standard_normal(int(dur * SR))
    if hp:
        n = np.diff(n, prepend=0)
    t = np.arange(len(n)) / SR
    return n * np.exp(-t * decay)


def reverb(x, seconds=2.4, mix=0.28):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t * 3.2)[:, None]
    ir[:, 1] = np.roll(ir[:, 1], 300)
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.stack([np.fft.irfft(np.fft.rfft(x[:, c], size) * np.fft.rfft(ir[:, c], size), size)[: len(x)] for c in range(2)], 1)
    wet *= np.sqrt((x ** 2).mean() / max((wet ** 2).mean(), 1e-12))
    return x * (1 - mix) + wet * mix


def music():
    pad = np.zeros((N, 2))
    t = 0.0
    while t < DUR:
        root, notes = chord_at(t)
        dur = min(2 * BAR, DUR - t)
        hold = max(dur + 1.2, 2.5)  # long enough for the 0.9 s attack and 1.4 s release
        for i, n in enumerate(notes):
            add(pad, t, pad_voice(midi(n), hold) * env_adsr(int(hold * SR), 0.9, 1.4), pan=(i - 1.5) * 0.35, gain=0.12)
        t += 2 * BAR
    # Pad swells slightly once the groove is in.
    tt = np.arange(N) / SR
    pad *= (0.9 + 0.1 * np.clip((tt - GROOVE_IN) / 2, 0, 1))[:, None]

    groove = np.zeros((N, 2))
    step = BEAT / 2
    k = 0
    t = GROOVE_IN
    while t < GROOVE_OUT:
        root, notes = chord_at(t)
        b = k % 8
        arp = [0, 2, 1, 3, 2, 1, 3, 2][b]
        add(groove, t, pluck(midi(notes[arp % len(notes)] + 12)), pan=(-0.45 if k % 2 else 0.45), gain=0.075)
        if b in (0, 4):
            add(groove, t, kick(), gain=0.42)
        if b in (0, 3, 4):
            add(groove, t, bass(midi(root), step * (2 if b != 3 else 1)), gain=0.2)
        add(groove, t, noise_burst(0.06, 70), pan=0.25, gain=0.016 if k % 2 else 0.009)
        if b in (2, 6):
            add(groove, t, noise_burst(0.18, 22), pan=-0.1, gain=0.02)
        t += step
        k += 1
    # Closing chord on the end card.
    for i, n in enumerate([50, 57, 62, 66, 69, 73, 76]):
        add(groove, END_CHORD, pluck(midi(n + 12), 4.5) * 0.9, pan=(i - 3) * 0.25, gain=0.06)
    return reverb(pad + groove * 0.9)


def load_vo(name):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(BUILD / "vo" / name), "-ar", str(SR), "-ac", "1", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def voice():
    v = np.zeros(N)
    for s in TL["scenes"]:
        for line in s["lines"]:
            a = load_vo(line["file"])
            i = int(line["start"] * SR)
            v[i:i + len(a)] += a[: N - i]
    return v


def sfx():
    out = np.zeros((N, 2))
    for name, clip in DATA["clips"].items():
        base = scene[name]["start"]
        for e in clip["events"]:
            t = base + e["t"]
            if e["type"] == "down":
                n = int(0.025 * SR)
                tt = np.arange(n) / SR
                tick = noise_burst(0.025, 260) * 0.6 + np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt * 300) * 0.4
                add(out, t, tick, pan=0.1, gain=0.05)
            elif e["type"] == "key":
                add(out, t, noise_burst(0.02, 320), pan=-0.1, gain=0.03)
            elif e["type"] == "shortcut":
                add(out, t, noise_burst(0.02, 320), gain=0.03)
                add(out, t + 0.09, noise_burst(0.02, 320), gain=0.03)
    # Soft swoosh into each scene after the hook.
    for s in TL["scenes"][1:]:
        n = int(0.7 * SR)
        x = np.cumsum(rng.standard_normal(n)) * 0.02
        x = np.diff(x, prepend=0) * 6 + x * 0.05
        e = np.sin(np.linspace(0, np.pi, n)) ** 2
        add(out, s["start"] - 0.6, x * e, pan=0.0, gain=0.045)
    return out


def duck_envelope(v):
    hop = int(0.01 * SR)
    frames = np.abs(v[: len(v) // hop * hop]).reshape(-1, hop).max(1)
    active = (frames > 0.02).astype(float)
    env = np.zeros_like(active)
    level = 0.0
    for i, a in enumerate(active):
        level += (a - level) * (0.25 if a > level else 0.03)
        env[i] = level
    env = np.repeat(env, hop)
    return np.pad(env, (0, N - len(env)), mode="edge")[:N]


def main():
    m = music()
    v = voice()
    duck = 1 - 0.58 * duck_envelope(v)
    fade = np.clip((DUR - np.arange(N) / SR) / 1.2, 0, 1) * np.clip(np.arange(N) / SR / 0.8, 0, 1)
    m *= (duck * fade)[:, None]
    m *= 0.052 / max(np.sqrt((m ** 2).mean()), 1e-9)
    v *= 0.2 / max(np.sqrt((v[v != 0] ** 2).mean()), 1e-9)
    mix = m + np.stack([v, v], 1) + sfx()
    out = BUILD / "audio"
    out.mkdir(exist_ok=True)
    sf.write(out / "pre_mix.wav", mix.astype(np.float32), SR, subtype="FLOAT")
    sf.write(out / "music.wav", m.astype(np.float32), SR, subtype="FLOAT")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(out / "pre_mix.wav"),
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), "-c:a", "pcm_s16le", str(out / "mix.wav")], check=True)
    print("wrote", out / "mix.wav", f"{DUR:.1f}s")


if __name__ == "__main__":
    main()
