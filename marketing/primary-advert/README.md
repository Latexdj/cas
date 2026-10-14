# Primary School Portal advert (9:16)

`Primary-Advert.mp4` is a 2 min 51 s vertical (1080×1920) advert for the CAS
Primary School Portal (KG 1 to Basic 6). It has a voiceover, burned-in
captions and a quiet music bed. Every UI shot was recorded from the real app
running locally, with each person on their own login: the headteacher (the
admin portal, desktop) and the Basic 4 class teacher (the teacher portal, on
a phone-sized screen).

| Time | Scene | What's on screen |
|---|---|---|
| 0:00 | Hook | A hand-ruled class register and mark book filled in by hand, then a terminal report written out |
| 0:12 | Intro | The headteacher signs in with the school code and lands on the Primary Portal |
| 0:18 | Headteacher | Dashboard: pupils, classes, today's attendance |
| 0:25 | School setup | Class Setup (Basic 4 and its class teacher), Subjects (Basic 4 checklist with class/exam weights), the GES A1–F9 grade scale, assessment modes and weights |
| 0:43 | Pupil records | A pupil's record: admission details, NHIS number, blood group, parents' contacts |
| 0:53 | Teacher, on the phone | Clock In: photo, GPS check against the school's location, 06:52 ✓ GPS verified |
| 1:02 | Class register | Mark all present, one absent, one late, save |
| 1:11 | Assessments | New Class Test 1 for Basic 4 Science, marks typed in, saved; class scores recalculated |
| 1:28 | Score sheet | The admin score sheet for Basic 4 Science: class, exam, total, grade, position |
| 1:34 | Report cards | A pupil's report: every subject, term attendance, affective ratings, the class teacher's remark, Submit for Approval |
| 1:54 | Headteacher approval | Report Approvals by class; Basic 4 → Approve with a headteacher's remark |
| 2:06 | Staff attendance | The teacher's clock-in in the office log (GPS verified), a leave request approved |
| 2:14 | Capitation Grant | The cash book: a payment added under its GES expenditure head; closing balance updates |
| 2:28 | End of year | End-of-Year Wizard: every class promoted, Basic 6 graduated |
| 2:36 | End card | CAS · Comprehensive Academic Suite, "Your whole primary school. In one place.", LatexTech, +233 24 8234 649 |

The school (Akwaaba Preparatory School, code AKP001), its teachers and
pupils are fictional (`demo-data/seed.py`). Everything on screen is the app's
own computation of that data. Two things are staged and say so in the seed
and capture scripts: the clock-in photo is a drawn signboard, and a demo-only
database trigger stamps the on-camera clock-in at 06:52 so it reads as a
morning arrival whenever it is recorded. After the first four class-test
marks are typed, the rest of the class's marks are filled in at once, as the
teacher would carry on typing.

Accounts & Fees is not in the advert: the primary Fees page reads the
secondary `students` table, so it can't bill primary pupils yet.

## Rebuilding it

This uses the same pipeline as `../waec-advert` (see its README for the
tools). Then:

```bash
python script/make_voiceover.py <kokoro.onnx> <voices.npz> build/vo
cd capture && node capture.js          # resets the demo data itself
python script/prep_video_data.py
python script/make_audio.py
cd video && npm install && npm run render
```

`node capture.js <scene> ...` re-records single scenes without reseeding;
scenes change data (the register, the class test, the report approval, the
promotions), so reset that data first or run it in full.
