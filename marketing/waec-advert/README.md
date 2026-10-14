# WAEC Results advert (9:16)

`WAEC-Results-Advert.mp4` is a 2-minute vertical (1080×1920) advert for the
CAS WAEC Results module, for WhatsApp Status, TikTok, Reels and Shorts. It has
a voiceover, burned-in captions and a quiet music bed. Every UI shot was
recorded from the real admin portal and principal portal running locally.

## What it covers

| Time | Scene | What's on screen |
|---|---|---|
| 0:00 | Hook | The raw WAEC listing scrolling behind type: the problem (Education Office report, A1–F9 by boys/girls, counting by hand) |
| 0:13 | Intro | CAS admin sidebar → Analytics |
| 0:16 | Import | WAEC Results → Import New Year → the three import modes (PDF, paste, Excel) → paste the 2025 listing → Parse → 112 candidates detected → enter an absentee (Registered recomputes) → Confirm & Save. A stopwatch shows the real time from "Import New Year" to the finished report |
| 0:44 | Report | Stat tiles, pass rate by subject, grade distribution scrolled across A1–F9 (B/G/T), computed summary next to WAEC's printed summary |
| 1:00 | Export | Export Excel + Export PDF, then the PDF that was actually downloaded |
| 1:08 | Analytics | Three years on record, overall trend 58% → 80%, filter to Mathematics (40% → 68%) and its grade distribution |
| 1:25 | Rankings | Best-six aggregate ranking, filtered by gender and subject |
| 1:32 | Student lookup | Search "Antwi" → result card with grades and aggregate |
| 1:40 | Principal's portal | The same reports in the principal portal |
| 1:46 | End card | CAS · Comprehensive Academic Suite, LatexTech, +233 24 8234 649 (the app's footer details) |

## Demo data

The school ("Akwaaba Senior High School", school # 0071204) and every
candidate are fictional. `demo-data/generate_listings.py` writes three years
of listings in the same text shape as a real WAEC results listing, and the
app's own parser reads them with no warnings. All figures in the voiceover
(58% → 80%, Mathematics 40% → 68%, 112 candidates) are the app's computed
results for this data.

## Rebuilding it

You need Postgres with the CAS schema and a demo school, the backend on :4000,
and the admin portal (production build) on :3001. 2023 and 2024 are imported
with `demo-data/import_year.py`; 2025 must not exist yet, because it is
imported on camera.

```bash
# 1. Voiceover (Kokoro-82M via kokoro-onnx) + master timeline
python script/make_voiceover.py <kokoro.onnx> <voices.npz> build/vo
# 2. Record the UI (Playwright + Chrome screencast at 2x, time-dilated 3x)
cd capture && node capture.js            # or: node capture.js report export
# 3. Gather clip data, the exported PDF and fonts for the composition
python script/prep_video_data.py
# 4. Music, UI sounds and the final mix
python script/make_audio.py
# 5. Render
cd video && npm install && npm run render
```

How the parts fit:

- `script/voiceover.json` holds the script. Each line has caption text and an
  optional spelling for pronunciation (WAEC is read as "wake", CAS as
  C-A-S). `make_voiceover.py` times every word and writes
  `build/vo/timeline.json`, and every other step works off that timeline.
- `capture/capture.js` performs each scene against the timeline, so a click
  lands on the word that describes it. It drives a real mouse along curved,
  eased paths and logs the cursor, clicks, key presses and camera cues.
  `capture/lib.js` slows the page's clock 3x while recording, so motion is
  captured at about 30 fps even at 1728×3072.
- `video/` is the Remotion composition. It handles the camera moves,
  cursor, click ripples, captions, chapter labels, stopwatch, transitions,
  hook and end card.
- `make_audio.py` synthesizes the music (original, so nothing to license),
  ducks it under the voice, adds soft click and key sounds at the recorded
  events, and normalizes to -14 LUFS.
