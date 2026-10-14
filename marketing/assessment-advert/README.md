# Assessment advert (9:16)

`Assessment-Advert.mp4` is a 2-minute vertical (1080×1920) advert for the CAS
Assessment module: CA and exam scores through to published report cards.
It has a voiceover, burned-in captions and a quiet music bed. Every UI shot
was recorded from the real app running locally, with each person on their
own login: the admin, the Mathematics teacher, the head of department, and a
student (on a phone-sized screen).

| Time | Scene | What's on screen |
|---|---|---|
| 0:00 | Hook | A hand-ruled mark book: tests, assignments, project, exam copied in, totalled and ranked by hand, and one total circled as wrong |
| 0:13 | Intro | Admin sidebar → Assessment |
| 0:16 | CA setup | Curriculum → CA Modes: Class Test, Assignment, Project Work, 10 marks each (CA 30%) |
| 0:24 | Teacher portal | Mathematics, 2 Science. Submit too early → the readiness check blocks it ("Project Work, no assessment created yet"). Add Project Work, type the first scores, upload the rest from the app's own Excel template (40 scores saved) |
| 0:47 | Submit | Every check passes → Confirm & Submit; scores lock |
| 0:53 | HOD review | The head of department's queue; open Mathematics, see score completeness and a results preview, Approve |
| 1:02 | Result approvals | Admin Final Approve, then Publish All Final-Approved |
| 1:10 | Admin monitoring | Assessment Tracker (per-teacher progress), then Outstanding Submissions |
| 1:19 | Report cards | The 2 Science ranking, a student's card with CA, exam, total, grade, position and remarks, Print All → the actual printed report cards (40 pages) |
| 1:34 | Student portal | The student's published report card on a phone, with class averages |
| 1:41 | Transcript | Search a student, their academic record |
| 1:47 | End card | CAS · Comprehensive Academic Suite, "Scores in. Report cards out.", LatexTech, +233 24 8234 649 |

The school, teachers and students are fictional (`demo-data/seed.py`, on top
of `../clearance-advert/demo-data/seed.py base` for the students). Everything
on screen is the app's own computation of that data.

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

`capture/print_cards.js` re-renders what "Print All" sends to the printer,
on its own.
