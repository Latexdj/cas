"""Collects everything the Remotion composition reads into
video/src/data.json: the voiceover timeline, every captured clip (frame
list, viewport, cursor/click/camera events) and the fonts. Paths in data.json are relative to build/ (Remotion's
public dir).

Usage: python3 prep_video_data.py
"""
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"


def main():
    timeline = json.loads((BUILD / "vo" / "timeline.json").read_text())
    clips = {}
    for name in [s["id"] for s in timeline["scenes"] if s["id"] not in ("hook", "cta")]:
        c = json.loads((BUILD / "capture" / name / "clip.json").read_text())
        moves = [e for e in c["events"] if e["type"] == "move"]
        # Thin the cursor samples a little (they arrive at ~36/s); keep
        # everything else as-is.
        thinned, last_t = [], -1
        for e in moves:
            if e["t"] - last_t >= 1 / 60:
                thinned.append([round(e["t"], 3), round(e["x"], 1), round(e["y"], 1)])
                last_t = e["t"]
        clips[name] = {
            "frames": [[round(f["t"], 4), f"capture/{name}/frames/{f['file']}"] for f in c["frames"]],
            "moves": thinned,
            "events": [e for e in c["events"] if e["type"] != "move"],
            "end": c["end"],
            "viewport": c["viewport"],
        }

    fonts = ROOT / "video" / "node_modules" / "geist" / "dist" / "fonts"
    (BUILD / "fonts").mkdir(exist_ok=True)
    for f in ["geist-sans/Geist-Regular.woff2", "geist-sans/Geist-Medium.woff2", "geist-sans/Geist-SemiBold.woff2",
              "geist-sans/Geist-Bold.woff2", "geist-sans/Geist-Black.woff2", "geist-mono/GeistMono-Regular.woff2"]:
        shutil.copy(fonts / f, BUILD / "fonts" / Path(f).name)

    data = {"timeline": timeline, "clips": clips}
    out = ROOT / "video" / "src" / "data.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print("wrote", out, f"{out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
