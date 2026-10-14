"""Synthesizes the advert voiceover with Kokoro-82M and lays out the master
timeline every other step (screen capture, music, composition) follows.

For each line in voiceover.json it writes a trimmed WAV, then times each
subtitle word: the audio is split at its internal pauses, the pauses are
matched to the punctuation in the line, and the words inside each spoken
run share that run's time in proportion to their phoneme counts.

Usage: python make_voiceover.py <kokoro.onnx> <voices.npz> <out_dir>
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from kokoro_onnx.tokenizer import Tokenizer

HERE = Path(__file__).parent
SR = 24000
CAS_PHONEMES = "sˌiːˌeɪˈɛs"

# Silence after each line. Scene lead-ins ("gapBefore") and per-line holds
# ("holdAfter", for an on-screen action to finish) live in voiceover.json;
# the capture step reads the resulting timeline, so on-screen actions land
# on the words that describe them.
LINE_GAP = 0.32


def phonemize(tok, text):
    if "{CAS}" in text:
        parts = text.split("{CAS}")
        return CAS_PHONEMES.join(tok.phonemize(p, "en-us") if p.strip() else p for p in parts).strip()
    return tok.phonemize(text, "en-us")


def trim(audio, thresh=0.012):
    idx = np.where(np.abs(audio) > thresh)[0]
    if not len(idx):
        return audio
    start = max(0, idx[0] - int(0.03 * SR))
    end = min(len(audio), idx[-1] + int(0.08 * SR))
    return audio[start:end]


def voiced_runs(audio, min_gap=0.13):
    """Return [(start, end)] seconds of speech separated by gaps >= min_gap."""
    hop = int(0.01 * SR)
    frames = audio[: len(audio) // hop * hop].reshape(-1, hop)
    energy = np.sqrt((frames ** 2).mean(axis=1))
    voiced = energy > 0.015
    runs, start, silent = [], None, 0
    for i, v in enumerate(voiced):
        if v:
            if start is None:
                start = i
            silent = 0
        elif start is not None:
            silent += 1
            if silent * 0.01 >= min_gap:
                runs.append((start * 0.01, (i - silent + 1) * 0.01))
                start, silent = None, 0
    if start is not None:
        runs.append((start * 0.01, len(voiced) * 0.01))
    return runs


def word_timings(tok, text, audio):
    words = text.split()
    weights = [max(1, len(re.sub(r"\s", "", tok.phonemize(re.sub(r"[^\w%+'\-]", " ", w), "en-us")))) for w in words]
    # Groups of words between punctuation marks: candidates for a pause.
    groups, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        if re.search(r"[,.:;?!]$", w) and i < len(words) - 1:
            groups.append(cur)
            cur = []
    groups.append(cur)
    runs = voiced_runs(audio)
    total = len(audio) / SR
    if len(runs) != len(groups):
        # Fall back to one run: proportional over the whole line.
        groups, runs = [list(range(len(words)))], [(runs[0][0] if runs else 0, runs[-1][1] if runs else total)]
    out = [None] * len(words)
    for g, (rs, re_) in zip(groups, runs):
        gw = sum(weights[i] for i in g)
        t = rs
        for i in g:
            d = (re_ - rs) * weights[i] / gw
            out[i] = {"word": words[i], "start": round(t, 3), "end": round(t + d, 3)}
            t += d
    return out


def main():
    model, voices, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    out_dir.mkdir(parents=True, exist_ok=True)
    spec = json.loads((HERE / "voiceover.json").read_text())
    kokoro = Kokoro(model, voices)
    tok = Tokenizer()
    t = 0.0
    timeline = {"sampleRate": SR, "scenes": []}
    for scene in spec["scenes"]:
        t += scene.get("gapBefore", 0.8)
        sc = {"id": scene["id"], "start": round(t, 3), "lines": []}
        for li, line in enumerate(scene["lines"]):
            say = line.get("say", line["text"])
            ph = phonemize(tok, say)
            # The fp16 model returns empty audio for a few phoneme sequences;
            # a 1-2% speed change sidesteps it without audibly changing pace.
            for speed in (spec["speed"], spec["speed"] * 1.02, spec["speed"] * 0.98, spec["speed"] * 1.04):
                audio, sr = kokoro.create(ph, voice=spec["voice"], speed=speed, is_phonemes=True)
                if len(audio) > 0.04 * SR * len(line["text"]) ** 0.5:
                    break
            else:
                raise RuntimeError(f"TTS produced no audio for: {line['text']}")
            assert sr == SR
            audio = trim(audio.astype(np.float32))
            name = f"{scene['id']}_{li}.wav"
            sf.write(out_dir / name, audio, SR)
            dur = len(audio) / SR
            words = word_timings(tok, line["text"], audio)
            sc["lines"].append({"file": name, "text": line["text"], "start": round(t, 3),
                                "duration": round(dur, 3), "words": words, "phonemes": ph})
            t += dur + LINE_GAP + line.get("holdAfter", 0)
        sc["end"] = round(t, 3)
        timeline["scenes"].append(sc)
        print(f"{scene['id']:10s} {sc['start']:6.2f} -> {sc['end']:6.2f}")
    timeline["duration"] = round(t + 0.6, 3)
    (out_dir / "timeline.json").write_text(json.dumps(timeline, indent=1, ensure_ascii=False))
    print("total", timeline["duration"])


if __name__ == "__main__":
    main()
