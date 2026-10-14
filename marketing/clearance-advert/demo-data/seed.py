"""Demo data for the Clearance advert, on top of the demo school used for
the WAEC advert (Akwaaba Senior High School, code AKW001). Every person is
fictional.

  python3 seed.py base      programmes, houses, students, fees, office
                            holders (teachers + non-teaching staff) and the
                            clearance offices, with no clearance started
  python3 seed.py progress  after clearance has been initiated: the offices
                            work through their lists via the real API, as
                            the staff assigned to each office

Two students are left untouched in the Library's queue so the advert can
clear one and refuse the other on camera (see STARS).
"""
import json
import random
import subprocess
import sys
import urllib.request

SCHOOL = "11111111-1111-1111-1111-111111111111"
CODE = "AKW001"
API = "http://localhost:4000"
PIN = "1234"
rng = random.Random(2025)

PROGRAMMES = ["General Arts", "Home Economics", "General Science"]
HOUSES = ["Aggrey House", "Asantewaa House", "Casely-Hayford House", "Nkrumah House"]
CLASSES = [("3 Arts 1", "General Arts", 40, 22), ("3 Home Econ", "Home Economics", 36, 22),
           ("3 Science", "General Science", 44, 22), ("2 Arts 1", "General Arts", 38, 23),
           ("2 Science", "General Science", 40, 23)]

FIRST_F = ["Abena", "Akosua", "Adwoa", "Ama", "Efua", "Afua", "Yaa", "Esi", "Akua", "Adjoa", "Mavis", "Priscilla",
           "Gifty", "Comfort", "Linda", "Rita", "Vida", "Barbara", "Joyce", "Mercy", "Patience", "Ruth", "Dorcas",
           "Hannah", "Eunice", "Rebecca", "Fatima", "Zainab", "Selasi", "Dzifa", "Edinam", "Naa", "Dede"]
FIRST_M = ["Kwame", "Kofi", "Kwabena", "Kwaku", "Yaw", "Kojo", "Kwesi", "Kweku", "Nana", "Emmanuel", "Samuel",
           "Isaac", "Daniel", "Prince", "Richard", "Eric", "Michael", "Ebenezer", "Godfred", "Francis", "Bernard",
           "Stephen", "Joseph", "Benjamin", "Ibrahim", "Mohammed", "Senyo", "Elikem", "Nii", "Felix"]
SURNAMES = ["Mensah", "Owusu", "Boateng", "Asante", "Osei", "Agyeman", "Appiah", "Addo", "Ofori", "Amoah", "Darko",
            "Sarpong", "Opoku", "Antwi", "Badu", "Bonsu", "Quaye", "Tetteh", "Lartey", "Nkansah", "Acheampong",
            "Frimpong", "Gyamfi", "Kyei", "Ansah", "Adjei", "Donkor", "Amponsah", "Fosu", "Yeboah", "Danso",
            "Agbeko", "Dogbe", "Kpodo", "Amegah", "Issah", "Alhassan", "Abubakar", "Seidu"]

# Office holders. (code, name, office)
TEACHERS = [
    ("T014", "Yaw Boakye", "Library"),
    ("T021", "Kofi Ansah", "Science Laboratory"),
    ("T009", "Emmanuel Tetteh", "Sports Department"),
    ("T003", "Gifty Ofori", "HOD — General Arts"),
    ("T007", "Linda Quaye", "HOD — Home Economics"),
    ("T005", "Samuel Addo", "HOD — General Science"),
    ("T016", "Francis Owusu", "Housemaster — Aggrey House"),
    ("T018", "Mavis Darko", "Housemistress — Asantewaa House"),
    ("T019", "Bernard Antwi", "Housemaster — Casely-Hayford House"),
    ("T020", "Rita Sarpong", "Housemistress — Nkrumah House"),
    ("T002", "Joseph Amoah", "Senior Housemaster"),
    ("T024", "Prince Agyeman", None),  # assigned to the ICT Lab on camera
]
STAFF = [("Comfort Adjei", "comfort.adjei@akwaabashs.edu.gh", "Dining Hall"),
         ("Isaac Mensah", "isaac.mensah@akwaabashs.edu.gh", "Stores")]
OFFICES = [  # (name, type, link)
    ("Library", "general", None), ("Science Laboratory", "general", None), ("Sports Department", "general", None),
    ("Dining Hall", "general", None), ("Stores", "general", None),
    ("HOD — General Arts", "hod", "General Arts"), ("HOD — Home Economics", "hod", "Home Economics"),
    ("HOD — General Science", "hod", "General Science"),
    ("Housemaster — Aggrey House", "housemaster", "Aggrey House"),
    ("Housemistress — Asantewaa House", "housemaster", "Asantewaa House"),
    ("Housemaster — Casely-Hayford House", "housemaster", "Casely-Hayford House"),
    ("Housemistress — Nkrumah House", "housemaster", "Nkrumah House"),
    ("Senior Housemaster", "senior_housemaster", None),
]
REASONS = {
    "Library": ["2 books not returned (Things Fall Apart, Biology for SHS)", "Library card not returned"],
    "Science Laboratory": ["Broken burette, replacement fee GH₵ 40 outstanding"],
    "Sports Department": ["House jersey not returned"],
    "Dining Hall": ["Cutlery set not returned"],
    "Stores": ["Mattress not returned to stores"],
    "HOD": ["Project work not submitted"],
    "House": ["Room inspection not done", "Locker key not returned"],
    "Senior Housemaster": ["Outstanding boarding fine"],
    "ICT Laboratory": ["Keyboard damaged, awaiting repair fee"],
}
# Students whose Library item stays pending for the on-camera scenes.
STARS = ["AKW22101", "AKW22102"]


def sql(q):
    out = subprocess.run(["psql", "-h", "localhost", "-U", "cas", "-d", "cas", "-v", "ON_ERROR_STOP=1", "-Atq", "-c", q],
                         capture_output=True, text=True, env={"PGPASSWORD": "cas", "PATH": "/usr/bin:/bin"})
    if out.returncode:
        raise RuntimeError(out.stderr)
    return out.stdout.strip()


def lit(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def bcrypt(pw):
    return subprocess.run(["node", "-e", f"console.log(require('bcrypt').hashSync('{pw}',10))"], cwd="/home/user/cas/backend",
                          capture_output=True, text=True, check=True).stdout.strip()


def call(path, body=None, token=None, method=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json", **({"authorization": "Bearer " + token} if token else {})},
                                 method=method)
    return json.load(urllib.request.urlopen(req))


def base():
    sql("ALTER TABLE students ADD COLUMN IF NOT EXISTS house TEXT; ALTER TABLE students ADD COLUMN IF NOT EXISTS picture_url TEXT")
    # Tables that reference these students/teachers (absences come from the
    # app's own absence-check job; the rest from the Assessment advert's seed).
    sql(f"DELETE FROM absences WHERE school_id='{SCHOOL}'; DELETE FROM result_submissions WHERE school_id='{SCHOOL}';"
        f"DELETE FROM exam_scores WHERE school_id='{SCHOOL}'; DELETE FROM assessments WHERE school_id='{SCHOOL}';"
        f"DELETE FROM timetable WHERE school_id='{SCHOOL}'; DELETE FROM report_remarks WHERE school_id='{SCHOOL}'")
    sql(f"DELETE FROM student_clearances WHERE school_id='{SCHOOL}'; DELETE FROM clearance_offices WHERE school_id='{SCHOOL}';"
        f"DELETE FROM fee_payments WHERE school_id='{SCHOOL}'; DELETE FROM student_bills WHERE school_id='{SCHOOL}';"
        f"DELETE FROM fee_items WHERE school_id='{SCHOOL}'; DELETE FROM students WHERE school_id='{SCHOOL}';"
        f"DELETE FROM school_staff WHERE school_id='{SCHOOL}'; DELETE FROM houses WHERE school_id='{SCHOOL}';"
        f"DELETE FROM programs WHERE school_id='{SCHOOL}';"
        f"DELETE FROM teachers WHERE school_id='{SCHOOL}' AND teacher_code IN ({','.join(lit(t[0]) for t in TEACHERS)})")
    prog = {}
    for p in PROGRAMMES:
        prog[p] = sql(f"INSERT INTO programs (school_id, name, exam_body) VALUES ('{SCHOOL}', {lit(p)}, 'WAEC') RETURNING id")
    for h in HOUSES:
        sql(f"INSERT INTO houses (school_id, name) VALUES ('{SCHOOL}', {lit(h)})")
    pin = bcrypt(PIN)
    used, rows = set(), []
    seq = {22: 0, 23: 0}
    for cls, programme, n, yr in CLASSES:
        people = []
        for _ in range(n):
            female = rng.random() < 0.52
            while True:
                name = f"{rng.choice(FIRST_F if female else FIRST_M)} {rng.choice(SURNAMES)}"
                if name not in used:
                    used.add(name)
                    break
            people.append((name, female))
        for name, female in sorted(people, key=lambda p: p[0].split()[-1] + p[0]):
            seq[yr] += 1
            code = f"AKW{yr}{seq[yr]:03d}"
            house = rng.choice(HOUSES)
            rows.append(f"('{SCHOOL}', {lit(code)}, {lit(name)}, {lit(cls)}, 'Active', '{prog[programme]}', '{pin}', "
                        f"{lit('Female' if female else 'Male')}, 'Boarding', {lit(house)}, 20{yr})")
    sql("INSERT INTO students (school_id, student_code, name, class_name, status, program_id, pin_hash, gender, "
        "residential_status, house, year_of_admission) VALUES " + ",".join(rows))

    # Fees: final-year bill; most paid in full, some still owing.
    item = sql(f"INSERT INTO fee_items (school_id, name) VALUES ('{SCHOOL}', 'School Fees, Final Year') RETURNING id")
    for sid, code in [r.split("|") for r in sql(f"SELECT id, student_code FROM students WHERE school_id='{SCHOOL}' AND class_name LIKE '3 %'").splitlines()]:
        bill = sql(f"INSERT INTO student_bills (school_id, student_id, fee_item_id, description, amount) VALUES "
                   f"('{SCHOOL}', '{sid}', '{item}', 'School Fees, Final Year', 1450) RETURNING id")
        paid = 1000 if (code in STARS[1:] or rng.random() < 0.12) else 1450
        sql(f"INSERT INTO fee_payments (school_id, student_id, bill_id, fee_item_id, amount, payment_date, payment_method, receipt_no) "
            f"VALUES ('{SCHOOL}', '{sid}', '{bill}', '{item}', {paid}, CURRENT_DATE - 30, 'Mobile Money', 'RCP-{code}')")

    teacher_ids = {}
    for code, name, _ in TEACHERS:
        teacher_ids[code] = sql(f"INSERT INTO teachers (school_id, name, status, is_admin, pin_hash, teacher_code) VALUES "
                                f"('{SCHOOL}', {lit(name)}, 'Active', false, '{pin}', '{code}') RETURNING id")
    staff_ids = {}
    staff_pw = bcrypt("clearance1")
    for name, email, _ in STAFF:
        staff_ids[name] = sql(f"INSERT INTO school_staff (school_id, name, email, password_hash) VALUES "
                              f"('{SCHOOL}', {lit(name)}, {lit(email)}, '{staff_pw}') RETURNING id")
        sql(f"INSERT INTO school_staff_roles (staff_id, school_id, role) VALUES ('{staff_ids[name]}', '{SCHOOL}', 'clearance')")
    for i, (name, typ, link) in enumerate(OFFICES):
        pid = prog.get(link) if typ == "hod" else None
        house = link if typ == "housemaster" else None
        oid = sql(f"INSERT INTO clearance_offices (school_id, name, office_type, linked_programme_id, linked_house, sort_order) "
                  f"VALUES ('{SCHOOL}', {lit(name)}, '{typ}', {lit(pid)}, {lit(house)}, {i + (1 if i >= 3 else 0)}) RETURNING id")
        for code, tname, office in TEACHERS:
            if office == name:
                sql(f"INSERT INTO clearance_office_staff (school_id, office_id, teacher_id) VALUES ('{SCHOOL}', '{oid}', '{teacher_ids[code]}')")
        for sname, _, office in STAFF:
            if office == name:
                sql(f"INSERT INTO clearance_office_staff (school_id, office_id, school_staff_id) VALUES ('{SCHOOL}', '{oid}', '{staff_ids[sname]}')")
    print(sql(f"SELECT class_name, count(*) FROM students WHERE school_id='{SCHOOL}' GROUP BY 1 ORDER BY 1"))
    print("offices:", sql(f"SELECT count(*) FROM clearance_offices WHERE school_id='{SCHOOL}'"))


def reason_for(office):
    for key in REASONS:
        if office.startswith(key) or (key == "House" and office.startswith(("Housemaster", "Housemistress"))):
            return rng.choice(REASONS[key])
    return "Outstanding item"


def progress():
    tokens = {}
    for code, _, _ in TEACHERS:
        tokens[code] = call("/api/auth/login", {"type": "teacher", "username": code, "password": PIN, "schoolCode": CODE})["token"]
    for name, email, _ in STAFF:
        tokens[email] = call("/api/auth/staff-login", {"email": email, "password": "clearance1", "schoolCode": CODE})["token"]
    holders = list(tokens.values())
    # Each office holder works through their own pending list.
    plan = {}
    for row in sql(f"SELECT student_code FROM students WHERE school_id='{SCHOOL}' AND class_name LIKE '3 %' ORDER BY student_code").splitlines():
        r = rng.random()
        plan[row] = "full" if r < 0.38 else "action" if r < 0.52 else "progress"
    plan[STARS[0]] = "progress_star"
    plan[STARS[1]] = "progress_star"
    done = 0
    for tok in holders:
        for item in call("/api/clearance/pending", token=tok):
            code, office = item["student_code"], item["office_name"]
            kind = plan.get(code)
            if kind is None:
                continue
            if code in STARS and office == "Library":
                continue
            if kind == "progress_star":
                status = "cleared" if rng.random() < 0.85 else None
            elif kind == "full":
                status = "cleared"
            elif kind == "action":
                status = "cleared" if rng.random() < 0.7 else None
            else:
                status = "cleared" if rng.random() < 0.6 else None
            if status:
                call("/api/clearance/action", {"item_id": item["item_id"], "status": status}, token=tok)
                done += 1
    # One office refuses each "action required" student, with a reason.
    for tok in holders:
        for item in call("/api/clearance/pending", token=tok):
            code = item["student_code"]
            if plan.get(code) == "action" and item["status"] == "pending" and rng.random() < 0.5:
                call("/api/clearance/action", {"item_id": item["item_id"], "status": "not_cleared",
                                                "notes": reason_for(item["office_name"])}, token=tok)
                plan[code] = "action_done"
    print("actions:", done)
    print(sql(f"SELECT CASE WHEN is_fully_cleared THEN 'fully cleared' ELSE 'in progress' END, count(*) FROM student_clearances "
              f"WHERE school_id='{SCHOOL}' GROUP BY 1"))


if __name__ == "__main__":
    {"base": base, "progress": progress}[sys.argv[1]]()
