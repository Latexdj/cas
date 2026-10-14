"""Demo data for the Assessment advert, on top of the demo school (Akwaaba
Senior High School, code AKW001) and the students created for the
Clearance advert. Every person is fictional.

The state it builds is the end of Semester 1, 2025/2026, for the SHS 2
classes:
  2 Science  every subject's CA and exam scores are in. English, Integrated
             Science and Social Studies are approved by the HOD and the
             admin; Physics is HOD-approved; Chemistry, Biology and
             Elective Maths are waiting for the HOD. Mathematics (the
             teacher on camera) has its Class Test and Assignment marked and
             exam scores entered, but no Project Work yet.
  2 Arts 1   partly done, so Outstanding Submissions has real gaps.

Usage: python3 seed.py
"""
import random
import subprocess
from pathlib import Path

SCHOOL = "11111111-1111-1111-1111-111111111111"
ADMIN = "22222222-2222-2222-2222-222222222222"
rng = random.Random(1209)
HERE = Path(__file__).parent

MODES = [("Class Test", 10, 1), ("Assignment", 10, 2), ("Project Work", 10, 3)]
MAX = {"Class Test": 20, "Assignment": 10, "Project Work": 20}
CORE = ["English Language", "Mathematics", "Integrated Science", "Social Studies"]
ELECTIVES = {"2 Science": ["Physics", "Chemistry", "Biology", "Elective Mathematics"],
             "2 Arts 1": ["Economics", "Government", "Literature in English", "Christian Religious Studies"]}
# (code, name, department, subjects)
TEACHERS = [
    ("T030", "Esi Badu", "Languages", ["English Language"]),
    ("T031", "Abena Asare", "Mathematics", ["Mathematics"]),
    ("T032", "Kwesi Ampofo", "Science", ["Integrated Science"]),
    ("T033", "Daniel Opoku", "Social Sciences", ["Social Studies"]),
    ("T034", "Elikem Agbeko", "Science", ["Physics"]),
    ("T035", "Dzifa Kpodo", "Science", ["Chemistry"]),
    ("T036", "Joyce Frimpong", "Science", ["Biology"]),
    ("T005", None, "Mathematics", ["Elective Mathematics"]),  # Samuel Addo, HOD General Science (clearance seed)
    ("T037", "Felix Nyarko", "Social Sciences", ["Economics"]),
    ("T038", "Ruth Lartey", "Social Sciences", ["Government"]),
    ("T039", "Hannah Quaye", "Languages", ["Literature in English"]),
    ("T040", "Godfred Owusu-Ansah", "Languages", ["Christian Religious Studies"]),
]
DIFFICULTY = {"Mathematics": 0.6, "Elective Mathematics": 0.8, "Physics": 0.5, "Chemistry": 0.4, "Integrated Science": 0.3,
              "English Language": 0.1, "Biology": 0.0, "Social Studies": -0.4, "Economics": 0.2, "Government": -0.2,
              "Literature in English": 0.0, "Christian Religious Studies": -0.5}
# Status of each 2 Science subject; "star" is finished on camera.
STATUS_2SCI = {"English Language": "final_approved", "Integrated Science": "final_approved", "Social Studies": "final_approved",
               "Physics": "hod_approved", "Chemistry": "submitted", "Biology": "submitted", "Elective Mathematics": "submitted",
               "Mathematics": "star"}
STATUS_ARTS = {"English Language": "submitted", "Mathematics": "partial", "Integrated Science": "submitted",
               "Social Studies": "hod_approved", "Economics": "partial", "Government": "draft",
               "Literature in English": "partial", "Christian Religious Studies": "submitted"}
CONDUCT = ["Respectful and well behaved", "Punctual and orderly", "Hardworking and cooperative", "Quiet and attentive"]
ATTITUDE = ["Very attentive in class", "Shows keen interest in learning", "Participates actively", "Can do better with more effort"]
REMARK_BY_BAND = [(75, "An excellent term. Keep it up."), (65, "A very good performance. Aim higher."),
                  (55, "A good effort. There is room for improvement."), (45, "Fair performance. Put in more effort."),
                  (0, "Must work much harder next term.")]


def sql(q, many=False):
    out = subprocess.run(["psql", "-h", "localhost", "-U", "cas", "-d", "cas", "-v", "ON_ERROR_STOP=1", "-Atq", "-c", q],
                         capture_output=True, text=True, env={"PGPASSWORD": "cas", "PATH": "/usr/bin:/bin"})
    if out.returncode:
        raise RuntimeError(out.stderr[:2000])
    return out.stdout.strip()


def lit(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    s = SCHOOL
    sql(f"DELETE FROM result_submissions WHERE school_id='{s}'; DELETE FROM exam_scores WHERE school_id='{s}';"
        f"DELETE FROM assessments WHERE school_id='{s}'; DELETE FROM assessment_modes WHERE school_id='{s}';"
        f"DELETE FROM report_remarks WHERE school_id='{s}'; DELETE FROM timetable WHERE school_id='{s}';"
        f"DELETE FROM semesters WHERE school_id='{s}'; DELETE FROM absences WHERE school_id='{s}';"
        f"DELETE FROM teachers WHERE school_id='{s}' AND teacher_code IN ({','.join(lit(t[0]) for t in TEACHERS if t[1])});"
        f"UPDATE schools SET ca_percentage = 30 WHERE id='{s}'")
    # Reuse the year if it exists: other tables (absences) reference it.
    year = sql(f"SELECT id FROM academic_years WHERE school_id='{s}' AND name='2025/2026'") or \
        sql(f"INSERT INTO academic_years (school_id, name, is_current, current_semester, start_date, end_date) VALUES "
            f"('{s}', '2025/2026', true, 1, '2025-09-08', '2026-07-24') RETURNING id")
    sql(f"UPDATE academic_years SET is_current = (id = '{year}'), current_semester = 1 WHERE school_id='{s}'")
    sql(f"INSERT INTO semesters (school_id, academic_year_id, number, name, start_date, end_date) VALUES "
        f"('{s}', '{year}', 1, 'Semester 1', '2025-09-08', '2025-12-19'), ('{s}', '{year}', 2, 'Semester 2', '2026-01-12', '2026-07-24')")
    modes = {}
    for name, contrib, order in MODES:
        modes[name] = sql(f"INSERT INTO assessment_modes (school_id, name, ca_contribution, sort_order) VALUES "
                          f"('{s}', {lit(name)}, {contrib}, {order}) RETURNING id")
    for sub in sorted({x for t in TEACHERS for x in t[3]}):
        sql(f"INSERT INTO subjects (school_id, name) VALUES ('{s}', {lit(sub)}) ON CONFLICT DO NOTHING")

    pin = subprocess.run(["node", "-e", "console.log(require('bcrypt').hashSync('1234',10))"], cwd="/home/user/cas/backend",
                         capture_output=True, text=True, check=True).stdout.strip()
    teacher_of = {}
    for code, name, dept, subs in TEACHERS:
        if name:
            tid = sql(f"INSERT INTO teachers (school_id, name, status, is_admin, pin_hash, teacher_code, department) VALUES "
                      f"('{s}', {lit(name)}, 'Active', false, '{pin}', '{code}', {lit(dept)}) RETURNING id")
        else:
            tid = sql(f"SELECT id FROM teachers WHERE school_id='{s}' AND teacher_code='{code}'")
            sql(f"UPDATE teachers SET department={lit(dept)} WHERE id='{tid}'")
        for sub in subs:
            teacher_of[sub] = tid

    classes = {c: [r.split("|") for r in sql(f"SELECT id, name FROM students WHERE school_id='{s}' AND class_name={lit(c)} ORDER BY name").splitlines()]
               for c in ELECTIVES}
    slot = 0
    for cls in ELECTIVES:
        for sub in CORE + ELECTIVES[cls]:
            day, period = slot % 5 + 1, slot // 5
            sql(f"INSERT INTO timetable (school_id, day_of_week, start_time, end_time, teacher_id, subject, class_names, academic_year_id, semester) "
                f"VALUES ('{s}', {day}, '{7 + period}:30', '{8 + period}:30', '{teacher_of[sub]}', {lit(sub)}, {lit(cls)}, '{year}', 1)")
            slot += 1

    ability = {sid: rng.gauss(0, 1) for c in classes.values() for sid, _ in c}

    def pct(sid, sub, spread=0.11):
        return max(0.08, min(0.99, 0.62 + 0.13 * ability[sid] - 0.07 * DIFFICULTY[sub] + rng.gauss(0, spread)))

    for cls, students in classes.items():
        statuses = STATUS_2SCI if cls == "2 Science" else STATUS_ARTS
        for sub in CORE + ELECTIVES[cls]:
            status, tid = statuses[sub], teacher_of[sub]
            mode_names = ["Class Test", "Assignment"] if status == "star" else ["Class Test", "Assignment", "Project Work"]
            if status == "partial":
                mode_names = ["Class Test", "Assignment"]
            for i, m in enumerate(mode_names):
                aid = sql(f"INSERT INTO assessments (school_id, academic_year_id, semester, subject, class_name, teacher_id, mode_id, title, date, max_score) "
                          f"VALUES ('{s}', '{year}', 1, {lit(sub)}, {lit(cls)}, '{tid}', '{modes[m]}', {lit(m + ' 1')}, "
                          f"'2025-{10 + i}-{rng.randint(6, 24):02d}', {MAX[m]}) RETURNING id")
                rows = []
                for sid, _ in students:
                    if rng.random() < 0.02:
                        rows.append(f"('{aid}', '{sid}', NULL, true)")
                    else:
                        rows.append(f"('{aid}', '{sid}', {round(pct(sid, sub) * MAX[m] * 2) / 2}, false)")
                sql("INSERT INTO assessment_scores (assessment_id, student_id, score, absent) VALUES " + ",".join(rows))
            if status != "draft":
                rows = [f"('{s}', '{year}', 1, {lit(sub)}, {lit(cls)}, '{sid}', '{tid}', {round(pct(sid, sub, 0.09) * 100)}, 100)"
                        for sid, _ in students]
                sql("INSERT INTO exam_scores (school_id, academic_year_id, semester, subject, class_name, student_id, teacher_id, score, max_score) VALUES " + ",".join(rows))
            if status in ("submitted", "hod_approved", "final_approved"):
                hod = sql(f"SELECT id FROM teachers WHERE school_id='{s}' AND teacher_code='T005'")
                extra = ""
                if status in ("hod_approved", "final_approved"):
                    extra = f", hod_reviewed_by='{hod}', hod_reviewed_at=now() - interval '2 days', hod_comment='Checked. Good work.'"
                if status == "final_approved":
                    extra += f", final_reviewed_by='{ADMIN}', final_reviewed_at=now() - interval '1 day'"
                sql(f"INSERT INTO result_submissions (school_id, academic_year_id, semester, subject, class_name, teacher_id, status, submitted_at) "
                    f"VALUES ('{s}', '{year}', 1, {lit(sub)}, {lit(cls)}, '{tid}', '{status}', now() - interval '3 days')")
                if extra:
                    sql(f"UPDATE result_submissions SET {extra[2:]} WHERE school_id='{s}' AND subject={lit(sub)} AND class_name={lit(cls)}")

    # Form-teacher remarks for the report cards.
    rows = []
    for sid, _ in classes["2 Science"]:
        band = 0.62 + 0.13 * ability[sid]
        remark = next(r for cut, r in REMARK_BY_BAND if band * 100 >= cut)
        rows.append(f"('{s}', '{sid}', '{year}', 1, {lit(rng.choice(ATTITUDE))}, {lit(rng.choice(CONDUCT))}, {lit(remark)})")
    sql("INSERT INTO report_remarks (school_id, student_id, academic_year_id, semester, attitude, conduct, general_remarks) VALUES " + ",".join(rows))

    # The scores sheet the Mathematics teacher uploads on camera.
    print(sql(f"SELECT subject, class_name, status FROM result_submissions WHERE school_id='{s}' ORDER BY class_name, status, subject"))
    print("year", year)


if __name__ == "__main__":
    main()
