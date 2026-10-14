# Clearance advert (9:16)

`Clearance-Advert.mp4` is a 2-minute vertical (1080×1920) advert for the CAS
Student Clearance module, for WhatsApp Status, TikTok, Reels and Shorts. It
has a voiceover, burned-in captions and a quiet music bed. Every UI shot was
recorded from the real app running locally, with each person on their own
login: the admin, a teacher (the librarian), a non-teaching staff member
(dining hall), a student (on a phone-sized screen) and the principal.

| Time | Scene | What's on screen |
|---|---|---|
| 0:00 | Hook | A paper clearance form: signatures inked in as offices are named, then the pile, the lost form, the unknown balances |
| 0:15 | Intro | Admin sidebar → Clearance |
| 0:19 | Offices & staff | The 13 offices (general, HOD per programme, housemaster per house, senior housemaster); add "ICT Laboratory"; assign Prince Agyeman; the non-teaching staff accounts |
| 0:38 | Start clearance | Initiate Batch Clearance → 3 final-year classes → 120 students initiated |
| 0:51 | Teacher portal | The Library's queue; look up AKW22101 and clear; look up AKW22102 and mark Not Cleared with a reason |
| 1:07 | Staff portal | Dining Hall clears a student from the staff portal |
| 1:13 | Student portal | AKW22102 on a phone: Action Required, 7 of 9, the Library's reason, and the Accounts Office item from unpaid fees (GH₵ 450) |
| 1:21 | Admin overview | Filter by class and status, open a student, override an office with a note |
| 1:35 | Principal's portal | Totals, then the certificate check on AKW22102: not fully cleared, Library and Sports pending |
| 1:45 | End card | CAS · Comprehensive Academic Suite, "Clearance without the queues", LatexTech, +233 24 8234 649 |

The school, staff and students are fictional (`demo-data/seed.py`). The offices'
progress before the teacher-portal scene was made through the real API as
each office's own staff (`seed.py progress`), so every status, timestamp
and count on screen is the app's own.

## Rebuilding it

This uses the same pipeline as `../waec-advert` (see its README for the
tools). The local database needs the demo school from that advert. Then:

```bash
python script/make_voiceover.py <kokoro.onnx> <voices.npz> build/vo
cd capture && node capture.js          # resets the demo data itself
python script/prep_video_data.py
python script/make_audio.py
cd video && npm install && npm run render
```

In `script/voiceover.json`, scene lead-ins (`gapBefore`) and per-line holds
(`holdAfter`) set the pacing, and the capture follows that timeline.
