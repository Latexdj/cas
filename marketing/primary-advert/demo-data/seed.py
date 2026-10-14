"""Demo data for the Primary School Portal advert: a separate, fictional
primary school (Akwaaba Preparatory School, code AKP001). Every person in it
is made up.

The state it builds is Term 1 of 2026/2027, a few weeks before the term ends:
  KG 1 to Basic 6, one class teacher each, 21 to 27 pupils per class.
  Every subject in every class has its class exercises, class test, project
  and end-of-term exam marked, except Basic 4 Science, which has no class test
  yet (the Basic 4 teacher adds it on camera).
  Report remarks: most classes are submitted or approved; Basic 4 has remarks
  drafted for every pupil but one, all still in draft.
  Daily registers and teacher clock-ins go back to the start of term. Today,
  every class but Basic 4 has marked its register and every teacher but the
  Basic 4 teacher has clocked in.
  A Capitation Grant cash book with this term's receipts and payments, and
  two pending leave requests.
  A trigger stamps this school's photo clock-ins made today at 06:52, so the
  clock-in filmed on camera shows a morning time whenever it is recorded.

Usage: python3 seed.py
"""
import datetime as dt
import json
import random
import subprocess

SCHOOL = "33333333-3333-3333-3333-333333333333"
ADMIN = "44444444-4444-4444-4444-444444444444"
CODE = "AKP001"
LAT, LNG = 5.6512, -0.1869
rng = random.Random(2026)
TODAY = dt.date.today()

CLASSES = ["KG 1", "KG 2", "Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5", "Basic 6"]
SUBJECTS = {
    "KG 1": ["Literacy", "Numeracy", "Environmental Studies", "Creative Arts", "RME", "Physical Development"],
    "Basic 1": ["English Language", "Mathematics", "Science", "Creative Arts", "Ghanaian Language",
                "Our World Our People (OWAP)", "History", "Physical Education (PE)", "Religious & Moral Education (RME)"],
}
SUBJECTS["KG 2"] = SUBJECTS["KG 1"]
for c in ["Basic 2", "Basic 3"]:
    SUBJECTS[c] = SUBJECTS["Basic 1"]
for c in ["Basic 4", "Basic 5", "Basic 6"]:
    SUBJECTS[c] = SUBJECTS["Basic 1"][:7] + ["Computing"] + SUBJECTS["Basic 1"][7:]
AGE = {c: 4 + i for i, c in enumerate(CLASSES)}
SIZE = {"KG 1": 21, "KG 2": 23, "Basic 1": 26, "Basic 2": 25, "Basic 3": 27, "Basic 4": 24, "Basic 5": 25, "Basic 6": 22}
# (code, name, gender, class)
TEACHERS = [
    ("T101", "Esi Annan", "Female", "KG 1"),
    ("T102", "Patience Adomako", "Female", "KG 2"),
    ("T103", "Rita Owusu", "Female", "Basic 1"),
    ("T104", "Grace Tetteh", "Female", "Basic 2"),
    ("T105", "Emmanuel Asiedu", "Male", "Basic 3"),
    ("T106", "Akosua Boateng", "Female", "Basic 4"),
    ("T107", "Kofi Larbi", "Male", "Basic 5"),
    ("T108", "Selorm Agbenyega", "Male", "Basic 6"),
]
STAR_CLASS, STAR_SUBJECT = "Basic 4", "Science"
REPORT_STATE = {"KG 1": "approved", "KG 2": "approved", "Basic 1": "approved", "Basic 2": "submitted",
                "Basic 3": "submitted", "Basic 4": "draft", "Basic 5": "submitted", "Basic 6": "mixed"}
MODES = [("Class Exercise", 10, False, None, 1), ("Class Test", 10, False, 3, 2),
         ("Project Work", 10, False, 1, 3), ("End of Term Exam", 70, True, 1, 4)]
# (mode, title, max)
ASSESSMENTS = [("Class Exercise", "Class Exercise 1", 10), ("Class Exercise", "Class Exercise 2", 10),
               ("Class Exercise", "Class Exercise 3", 10), ("Class Test", "Class Test 1", 20),
               ("Project Work", "Project Work", 20), ("End of Term Exam", "End of Term Exam", 100)]
GRADES = [("A1", 80, 100, "Excellent"), ("B2", 70, 79, "Very Good"), ("B3", 60, 69, "Good"), ("C4", 55, 59, "Credit"),
          ("C5", 50, 54, "Credit"), ("C6", 45, 49, "Credit"), ("D7", 40, 44, "Pass"), ("E8", 35, 39, "Pass"), ("F9", 0, 34, "Fail")]

BOYS = ["Kwame", "Kofi", "Kwabena", "Yaw", "Kojo", "Kwaku", "Kwasi", "Fiifi", "Ekow", "Nii", "Elikem", "Selasi", "Mawuli",
        "Nana", "Jeremiah", "Daniel", "Samuel", "Caleb", "Joshua", "Ibrahim", "Issah", "Bright", "Prince", "Michael", "David"]
GIRLS = ["Ama", "Akosua", "Abena", "Adwoa", "Yaa", "Afua", "Efua", "Esi", "Aba", "Naa", "Dzifa", "Enam", "Elinam", "Akua",
         "Maame", "Nhyira", "Adjoa", "Gifty", "Blessing", "Precious", "Mercy", "Hannah", "Zainab", "Ayisha", "Lydia"]
SURNAMES = ["Mensah", "Owusu", "Asante", "Boateng", "Appiah", "Osei", "Agyei", "Darko", "Addo", "Ofori", "Amponsah", "Quaye",
            "Tetteh", "Lamptey", "Kumi", "Danso", "Adjei", "Badu", "Nyarko", "Sarpong", "Ansah", "Amoah", "Frimpong",
            "Gyamfi", "Acquah", "Bonsu", "Kyei", "Fosu", "Agbeko", "Kpodo", "Dogbe", "Abubakar", "Yeboah", "Antwi",
            "Opoku", "Asiamah", "Okyere", "Bediako", "Tawiah", "Larbi"]
OCCUPATIONS = ["Trader", "Teacher", "Nurse", "Driver", "Mechanic", "Seamstress", "Civil Servant", "Accountant",
               "Farmer", "Electrician", "Banker", "Pharmacist", "Carpenter", "Caterer", "Engineer"]
TOWNS = [("Akropong", "Akuapem North", "Eastern"), ("Ho", "Ho Municipal", "Volta"), ("Kumasi", "Kumasi Metro", "Ashanti"),
         ("Cape Coast", "Cape Coast Metro", "Central"), ("Koforidua", "New Juaben South", "Eastern"),
         ("Tamale", "Tamale Metro", "Northern"), ("Winneba", "Effutu", "Central"), ("Keta", "Keta Municipal", "Volta")]
REMARKS = [(80, "An excellent term. {n} is a keen, hardworking pupil. Keep it up."),
           (70, "A very good term. {n} works hard and takes part in class."),
           (60, "A good term. {n} can do even better with more reading at home."),
           (50, "Fair progress. {n} needs to pay more attention in class."),
           (0, "{n} needs extra support, especially with reading and numbers.")]
HEAD_REMARKS = ["Well done. Keep it up.", "A good report. Aim higher next term.", "Promising. Keep working hard."]


def sql(q):
    out = subprocess.run(["psql", "-h", "localhost", "-U", "cas", "-d", "cas", "-v", "ON_ERROR_STOP=1", "-Atq"], input=q,
                         capture_output=True, text=True, env={"PGPASSWORD": "cas", "PATH": "/usr/bin:/bin"})
    if out.returncode:
        raise RuntimeError(out.stderr[:2000])
    return out.stdout.strip()


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def insert(table, cols, rows, chunk=400):
    for i in range(0, len(rows), chunk):
        vals = ",".join("(" + ",".join(lit(v) for v in r) + ")" for r in rows[i:i + chunk])
        sql(f"INSERT INTO {table} ({','.join(cols)}) VALUES {vals}")


def phone():
    return "0" + rng.choice(["24", "54", "55", "20", "50", "27", "26"]) + "".join(str(rng.randint(0, 9)) for _ in range(7))


def weekdays(a, b):
    d = a
    while d <= b:
        if d.weekday() < 5:
            yield d
        d += dt.timedelta(days=1)


def grade(total):
    return next(g for g, lo, hi, _ in GRADES if total >= lo)


def main():
    s = SCHOOL
    pin = subprocess.run(["node", "-e", "console.log(require('bcrypt').hashSync('1234',10))"], cwd="/home/user/cas/backend",
                         capture_output=True, text=True, check=True).stdout.strip()

    # Start clean: the school row cascades to everything that hangs off it.
    sql(f"DELETE FROM schools WHERE id='{s}'")
    sql(f"""INSERT INTO schools (id, name, email, phone, address, school_type, school_category, school_level, motto, region,
            district, admission_prefix, admission_year, school_latitude, school_longitude, school_gps_radius, code,
            headmaster_name, vision, mission)
        VALUES ('{s}', 'Akwaaba Preparatory School', 'office@akwaabaprep.example', '0302 000 111', 'P. O. Box 14, Dzorwulu, Accra',
            'Primary', 'Private', 'primary', 'Learn, Love, Lead', 'Greater Accra', 'Ayawaso West', 'AKP', '2026',
            {LAT}, {LNG}, 150, '{CODE}', 'Comfort Asamoah',
            'Every child reading, counting and caring by the end of Basic 3.',
            'A safe, joyful school where every pupil is known by name.')""")
    plan = sql("SELECT plan_id FROM subscriptions WHERE plan_id IS NOT NULL LIMIT 1")
    sql(f"INSERT INTO subscriptions (school_id, plan_id, status, starts_at, ends_at, teacher_limit) VALUES "
        f"('{s}', '{plan}', 'active', now() - interval '60 days', now() + interval '1 year', 200)")
    sql(f"INSERT INTO school_modules (school_id, module_key, enabled) "
        f"SELECT '{s}', module_key, true FROM school_modules WHERE school_id='11111111-1111-1111-1111-111111111111'")

    sql(f"INSERT INTO teachers (id, school_id, name, status, is_admin, pin_hash, teacher_code, gender, phone, rank) VALUES "
        f"('{ADMIN}', '{s}', 'Comfort Asamoah', 'Active', true, '{pin}', 'ADMIN', 'Female', '0244000111', 'Headteacher')")
    teacher_of, teachers = {}, {}
    for code, name, gender, cls in TEACHERS:
        first = name.split()[0].lower()
        tid = sql(f"INSERT INTO teachers (school_id, name, status, is_admin, pin_hash, teacher_code, gender, phone, email, rank, "
                  f"academic_qualification, professional_qualification) VALUES ('{s}', {lit(name)}, 'Active', false, '{pin}', "
                  f"'{code}', '{gender}', '{phone()}', '{first}@akwaabaprep.example', 'Senior Superintendent II', "
                  f"'B.Ed. Basic Education', 'Licensed Teacher (NTC)') RETURNING id")
        teacher_of[cls], teachers[code] = tid, tid

    # Year and terms.
    year = sql(f"INSERT INTO academic_years (school_id, name, is_current, current_semester, start_date, end_date) VALUES "
               f"('{s}', '2026/2027', true, 1, '2026-09-08', '2027-07-23') RETURNING id")
    sql(f"INSERT INTO academic_years (school_id, name, is_current, start_date, end_date) VALUES "
        f"('{s}', '2025/2026', false, '2025-09-09', '2026-07-24')")
    term_start, term_end = dt.date(2026, 9, 8), dt.date(2026, 12, 18)
    term = sql(f"INSERT INTO primary_terms (school_id, academic_year_id, term_number, name, start_date, end_date, is_current) VALUES "
               f"('{s}', '{year}', 1, 'Term 1', '{term_start}', '{term_end}', true) RETURNING id")
    sql(f"INSERT INTO primary_terms (school_id, academic_year_id, term_number, name, start_date, end_date) VALUES "
        f"('{s}', '{year}', 2, 'Term 2', '2027-01-12', '2027-04-01'), ('{s}', '{year}', 3, 'Term 3', '2027-04-27', '2027-07-23')")

    insert("primary_classes", ["school_id", "class_name", "sort_order"], [(s, c, i + 1) for i, c in enumerate(CLASSES)])
    insert("primary_class_teachers", ["school_id", "teacher_id", "class_name", "academic_year_id"],
           [(s, teacher_of[c], c, year) for c in CLASSES])
    insert("primary_grade_scale", ["school_id", "grade", "min_score", "max_score", "description", "sort_order"],
           [(s, g, lo, hi, d, i + 1) for i, (g, lo, hi, d) in enumerate(GRADES)])
    modes = {}
    for name, w, term_exam, mx, order in MODES:
        modes[name] = sql(f"INSERT INTO primary_assessment_modes (school_id, name, ca_weight, is_terminal_exam, max_instances, sort_order) "
                          f"VALUES ('{s}', {lit(name)}, {w}, {lit(term_exam)}, {lit(mx)}, {order}) RETURNING id")
    catalog = {}
    for i, name in enumerate(dict.fromkeys(x for c in CLASSES for x in SUBJECTS[c])):
        catalog[name] = sql(f"INSERT INTO primary_subject_catalog (school_id, subject_name, sort_order) VALUES ('{s}', {lit(name)}, {i + 1}) RETURNING id")
    subject_id = {}
    for c in CLASSES:
        for i, name in enumerate(SUBJECTS[c]):
            subject_id[c, name] = sql(f"INSERT INTO primary_subjects (school_id, class_name, subject_name, max_class_score, max_exam_score, "
                                      f"sort_order, catalog_id) VALUES ('{s}', {lit(c)}, {lit(name)}, 30, 70, {i + 1}, '{catalog[name]}') RETURNING id")

    # Pupils.
    pupils, used, seq = {}, set(), 0
    for c in CLASSES:
        pupils[c] = []
        for _ in range(SIZE[c]):
            sex = rng.choice(["Male", "Female"])
            while True:
                first = rng.choice(BOYS if sex == "Male" else GIRLS)
                other = first + (" " + rng.choice(BOYS if sex == "Male" else GIRLS) if rng.random() < 0.35 else "")
                sur = rng.choice(SURNAMES)
                if (sur, first) not in used:
                    used.add((sur, first))
                    break
            seq += 1
            joined = 2026 - (AGE[c] - 4) - (1 if rng.random() < 0.15 else 0)
            adm = f"AKP/{joined}/{seq:03d}"
            dob = dt.date(2026 - AGE[c] - 1, rng.randint(1, 12), rng.randint(1, 28))
            town, district, region = rng.choice(TOWNS)
            father, mother = f"{rng.choice(BOYS)} {sur}", f"{rng.choice(GIRLS)} {rng.choice(SURNAMES)}"
            pid = sql(f"""INSERT INTO primary_students (school_id, admission_number, surname, other_names, date_of_birth, sex, religion,
                    hometown, district_of_origin, region_of_origin, residential_address, nhis_number, blood_group,
                    immunization_bcg, immunization_dpt, immunization_polio, immunization_measles, class_name, date_of_admission,
                    father_name, father_occupation, father_phone, mother_name, mother_occupation, mother_phone,
                    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)
                VALUES ('{s}', '{adm}', {lit(sur)}, {lit(other)}, '{dob}', '{sex}', {lit(rng.choice(['Christian'] * 4 + ['Muslim']))},
                    {lit(town)}, {lit(district)}, {lit(region)}, {lit(rng.choice(['Dzorwulu', 'Abelemkpe', 'Roman Ridge', 'Kotobabi', 'Achimota', 'Alajo']) + ', Accra')},
                    '{rng.randint(10000000, 99999999)}', {lit(rng.choice(['O+', 'O+', 'A+', 'B+', 'AB+', 'O-']))},
                    true, true, true, {lit(rng.random() < 0.9)}, {lit(c)}, '{dt.date(joined, 9, 8)}',
                    {lit(father)}, {lit(rng.choice(OCCUPATIONS))}, '{phone()}', {lit(mother)}, {lit(rng.choice(OCCUPATIONS))}, '{phone()}',
                    {lit(mother)}, '{phone()}', 'Mother') RETURNING id""")
            pupils[c].append((pid, f"{sur} {other}", first, rng.gauss(0, 1)))

    # Daily registers since the start of term. Today only for classes other than Basic 4.
    rows = []
    for c in CLASSES:
        for d in weekdays(term_start, TODAY):
            if d == TODAY and c == STAR_CLASS:
                continue
            for pid, _, _, ab in pupils[c]:
                r = rng.random() + 0.02 * ab
                st = "absent" if r < 0.035 else "late" if r < 0.07 else "excused" if r < 0.08 else "present"
                rows.append((s, pid, c, str(d), st, teacher_of[c]))
    insert("primary_daily_attendance", ["school_id", "student_id", "class_name", "date", "status", "marked_by"], rows, 2000)

    # Teacher clock-ins since the start of term. Today, everyone but the Basic 4 teacher.
    rows = []
    for code, _, _, cls in TEACHERS:
        for d in weekdays(term_start, TODAY):
            if d == TODAY and cls == STAR_CLASS:
                continue
            if rng.random() < 0.03 and d != TODAY:
                continue  # a day with no clock-in
            cin = dt.datetime.combine(d, dt.time(6, 35)) + dt.timedelta(minutes=rng.randint(0, 50))
            cout = None if d == TODAY else dt.datetime.combine(d, dt.time(14, 40)) + dt.timedelta(minutes=rng.randint(0, 60))
            gps = f"{LAT + rng.uniform(-0.0004, 0.0004):.6f},{LNG + rng.uniform(-0.0004, 0.0004):.6f}"
            # Clock times are stored in UTC; Ghana is on UTC, so these read as local time.
            rows.append((s, teachers[code], str(d), "present", f"{cin}+00", gps, True, 14.2,
                         None if cout is None else f"{cout}+00", None if cout is None else gps, cout is not None))
    insert("primary_teacher_self_attendance", ["school_id", "teacher_id", "date", "status", "clock_in_time", "clock_in_gps",
                                               "clock_in_location_verified", "photo_size_kb_in", "clock_out_time", "clock_out_gps",
                                               "clock_out_location_verified"], rows, 1000)

    # Assessments and scores, then the report scores exactly as the app computes them.
    weight = {m: w for m, w, *_ in MODES}
    for c in CLASSES:
        for subj in SUBJECTS[c]:
            sid = subject_id[c, subj]
            diff = rng.uniform(-0.06, 0.08)
            per_mode = {pid: {} for pid, *_ in pupils[c]}
            for k, (mode, title, mx) in enumerate(ASSESSMENTS):
                if (c, subj) == (STAR_CLASS, STAR_SUBJECT) and mode == "Class Test":
                    continue
                aid = sql(f"INSERT INTO primary_assessments (school_id, teacher_id, term_id, subject_id, class_name, title, type, max_score, mode_id, created_at) "
                          f"VALUES ('{s}', '{teacher_of[c]}', '{term}', '{sid}', {lit(c)}, {lit(title)}, "
                          f"{lit('summative' if mode == 'End of Term Exam' else 'formative')}, {mx}, '{modes[mode]}', now() - interval '{40 - k * 6} days') RETURNING id")
                rows = []
                for pid, _, _, ab in pupils[c]:
                    p = max(0.15, min(1.0, 0.66 + 0.14 * ab - diff + rng.gauss(0, 0.09)))
                    sc = round(p * mx * 2) / 2 if mx <= 20 else round(p * mx)
                    rows.append((aid, pid, sc, False))
                    per_mode[pid].setdefault(mode, []).append(sc / mx * 100)
                insert("primary_assessment_scores", ["assessment_id", "student_id", "score", "absent"], rows)
            rows = []
            for pid, *_ in pupils[c]:
                ca_modes = [m for m in per_mode[pid] if m != "End of Term Exam"]
                cw = sum(weight[m] for m in ca_modes)
                cs = round(sum(sum(v) / len(v) * weight[m] for m, v in per_mode[pid].items() if m in ca_modes) / cw / 100 * 30, 2)
                es = round(per_mode[pid]["End of Term Exam"][0] / 100 * 70, 2)
                total = round(cs + es, 2)
                rows.append((s, pid, sid, term, year, cs, es, total, grade(total), teacher_of[c]))
            insert("primary_scores", ["school_id", "student_id", "subject_id", "term_id", "academic_year_id", "class_score",
                                      "exam_score", "total", "grade", "teacher_id"], rows)
    sql(f"""UPDATE primary_scores sc SET position = r.pos FROM (
              SELECT id, RANK() OVER (PARTITION BY subject_id ORDER BY total DESC NULLS LAST) AS pos
              FROM primary_scores WHERE school_id='{s}' AND term_id='{term}') r WHERE sc.id = r.id""")

    # Report remarks.
    avg = dict((r.split("|")[0], float(r.split("|")[1])) for r in sql(
        f"SELECT student_id, AVG(total) FROM primary_scores WHERE school_id='{s}' GROUP BY student_id").splitlines())
    rows = []
    for c in CLASSES:
        state = REPORT_STATE[c]
        first_on_list = min(pupils[c], key=lambda p: p[1])[0]
        for i, (pid, _, first, ab) in enumerate(pupils[c]):
            if c == STAR_CLASS and pid == first_on_list:
                continue  # the first pupil on the class list gets remarks on camera
            st = state if state != "mixed" else ("submitted" if i % 3 else "approved")
            ratings = {t: max(2, min(5, round(3.6 + 0.8 * ab + rng.gauss(0, 0.6))))
                       for t in ['Punctuality', 'Neatness', 'Attentiveness', 'Participation', 'Conduct', 'Honesty', 'Leadership']}
            remark = next(r for cut, r in REMARKS if avg[pid] >= cut).format(n=first)
            approved = st == "approved"
            rows.append((s, pid, term, year, json.dumps(ratings), remark, teacher_of[c],
                         None if st == "draft" else f"{TODAY - dt.timedelta(days=2)} 15:10:00+00",
                         rng.choice(HEAD_REMARKS) if approved else None, ADMIN if approved else None,
                         f"{TODAY - dt.timedelta(days=1)} 10:30:00+00" if approved else None, st))
    insert("primary_report_remarks", ["school_id", "student_id", "term_id", "academic_year_id", "affective_ratings",
                                      "class_teacher_remarks", "class_teacher_id", "class_teacher_submitted_at", "headmaster_remarks",
                                      "headmaster_id", "headmaster_approved_at", "status"], rows)

    # Leave requests.
    insert("primary_teacher_excuses", ["school_id", "teacher_id", "date_from", "date_to", "excuse_type", "reason", "status", "reviewed_by", "reviewed_at"], [
        (s, teachers["T107"], str(TODAY + dt.timedelta(days=6)), str(TODAY + dt.timedelta(days=7)), "Official Duty",
         "District mathematics workshop at Achimota.", "Pending", None, None),
        (s, teachers["T102"], str(TODAY + dt.timedelta(days=2)), str(TODAY + dt.timedelta(days=2)), "Sick Leave",
         "Hospital review appointment.", "Pending", None, None),
        (s, teachers["T103"], "2026-09-24", "2026-09-25", "Sick Leave", "Malaria. Medical note attached.", "Approved", ADMIN, "2026-09-23 12:00:00+00"),
    ])

    # Capitation Grant cash book for the year.
    cb = sql(f"INSERT INTO primary_cashbooks (school_id, academic_year_id, fund_source, opening_balance, notes) VALUES "
             f"('{s}', '{year}', 'Capitation Grant', 1240.50, 'Balance brought forward from 2025/2026') RETURNING id")
    insert("primary_cashbook_entries", ["cashbook_id", "school_id", "entry_date", "entry_type", "particulars", "expenditure_head", "voucher_ref", "amount"], [
        (cb, s, "2026-09-15", "receipt", "Capitation Grant, Term 1 release", None, "GES/CG/26-1", 3720.00),
        (cb, s, "2026-09-17", "payment", "Exercise books and pencils, KG 1 to Basic 3", "Teaching & Learning Materials", "PV 001", 1185.00),
        (cb, s, "2026-09-22", "payment", "Chalk, markers and manila cards", "Teaching & Learning Materials", "PV 002", 342.50),
        (cb, s, "2026-09-29", "payment", "Repair of Basic 2 classroom door and louvres", "Minor Repairs & Maintenance", "PV 003", 460.00),
        (cb, s, "2026-10-02", "payment", "Workshop on the new curriculum, 8 teachers", "Teacher In-Service Training", "PV 004", 320.00),
        (cb, s, "2026-10-06", "payment", "Inter-school sports, transport", "Sports & Cultural Activities", "PV 005", 380.00),
        (cb, s, "2026-10-09", "payment", "Uniforms and sandals for two pupils", "Support for Needy Pupils", "PV 006", 415.00),
    ])

    # The on-camera clock-in happens whenever the capture runs; this school's
    # photo clock-ins made today are stamped 06:52, a normal arrival time.
    sql(f"""CREATE OR REPLACE FUNCTION demo_akp_clock_in() RETURNS trigger AS $$
            BEGIN
              IF NEW.school_id = '{s}' AND NEW.date = current_date AND NEW.clock_in_photo IS NOT NULL THEN
                NEW.clock_in_time := current_date + time '06:52:00';
              END IF;
              RETURN NEW;
            END $$ LANGUAGE plpgsql;
            DROP TRIGGER IF EXISTS demo_akp_clock_in ON primary_teacher_self_attendance;
            CREATE TRIGGER demo_akp_clock_in BEFORE INSERT ON primary_teacher_self_attendance
              FOR EACH ROW EXECUTE FUNCTION demo_akp_clock_in();""")

    print("year", year, "term", term)
    print(sql(f"SELECT class_name, COUNT(*) FROM primary_students WHERE school_id='{s}' GROUP BY 1 ORDER BY 1"))


if __name__ == "__main__":
    main()
