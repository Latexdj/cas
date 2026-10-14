"""Generates fictional WAEC results listings for the demo school used in the
WAEC Results advert. Every name is a random combination of common Ghanaian
first names and surnames; no real candidate data is used. The text follows
the same shape the real listing produces (one field per line, the
"Total Number of Candidates" footer and WAEC's SUMMARY OF SUBJECT PASSES
block), so it goes through the app's real parser unchanged.

Usage: python3 generate_listings.py <out_dir>
"""
import random
import sys
from pathlib import Path

SCHOOL = "AKWAABA SENIOR HIGH SCHOOL"
SCHOOL_NO = "0071204"

FIRST_F = ["Abena", "Akosua", "Adwoa", "Ama", "Efua", "Afua", "Yaa", "Esi", "Akua", "Adjoa",
           "Mavis", "Priscilla", "Gifty", "Comfort", "Linda", "Rita", "Vida", "Barbara",
           "Joyce", "Mercy", "Patience", "Ruth", "Dorcas", "Hannah", "Eunice", "Rebecca",
           "Fatima", "Zainab", "Rahinatu", "Selasi", "Dzifa", "Edinam", "Naa", "Dede"]
FIRST_M = ["Kwame", "Kofi", "Kwabena", "Kwaku", "Yaw", "Kojo", "Kwesi", "Kweku", "Nana",
           "Emmanuel", "Samuel", "Isaac", "Daniel", "Prince", "Richard", "Eric", "Michael",
           "Ebenezer", "Godfred", "Francis", "Bernard", "Stephen", "Joseph", "Benjamin",
           "Ibrahim", "Abdul-Rashid", "Mohammed", "Senyo", "Elikem", "Nii", "Jojo", "Felix"]
SURNAMES = ["Mensah", "Owusu", "Boateng", "Asante", "Osei", "Agyeman", "Appiah", "Addo",
            "Ofori", "Amoah", "Darko", "Sarpong", "Opoku", "Antwi", "Badu", "Bonsu", "Quaye",
            "Tetteh", "Lartey", "Nkansah", "Acheampong", "Frimpong", "Gyamfi", "Kyei",
            "Ansah", "Adjei", "Donkor", "Amponsah", "Fosu", "Yeboah", "Danso", "Kuffour",
            "Agbeko", "Dogbe", "Kpodo", "Amegah", "Issah", "Alhassan", "Abubakar", "Seidu"]

CORE = ["SOCIAL STUDIES", "ENGLISH LANG", "MATHEMATICS(CORE)", "INTEGRATED SCIENCE"]
PROGRAMMES = {
    "arts": ["ECONOMICS", "LIT-IN-ENGLISH", "CHRISTIAN REL STUD", "HISTORY"],
    "homeec": ["ECONOMICS", "BIOLOGY", "FOODS & NUTRITION", "MGT IN LIVING"],
}
GRADES = ["A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9"]

# Per-subject difficulty offset (positive = harder). Mathematics and
# Integrated Science are the usual weak spots; Social Studies and
# Management in Living usually do well.
DIFFICULTY = {
    "MATHEMATICS(CORE)": 1.1, "INTEGRATED SCIENCE": 0.8, "ENGLISH LANG": 0.3,
    "SOCIAL STUDIES": -0.6, "ECONOMICS": 0.5, "LIT-IN-ENGLISH": 0.2,
    "CHRISTIAN REL STUD": -0.4, "HISTORY": 0.1, "BIOLOGY": 0.6,
    "FOODS & NUTRITION": -0.2, "MGT IN LIVING": -0.7,
}

# year -> (candidate count, mean grade index; lower is better)
YEARS = {2023: (84, 6.9), 2024: (96, 6.4), 2025: (112, 5.7)}


def grade_for(ability, subject, year_mean, rng):
    idx = year_mean + DIFFICULTY[subject] + ability + rng.gauss(0, 1.0)
    return GRADES[max(0, min(8, round(idx)))]


def wrap(text, width=22):
    """Break the results text into short lines like the PDF extraction."""
    out, line = [], ""
    for word in text.split(" "):
        if line and len(line) + 1 + len(word) > width:
            out.append(line)
            line = word
        else:
            line = f"{line} {word}" if line else word
    if line:
        out.append(line)
    return out


def build(year, count, mean, rng):
    used = set()
    lines = [
        "WAEC Results Listing",
        "The West African Examinations Council",
        f"THE WEST AFRICAN SENIOR SCHOOL CERTIFICATE RESULTS LISTING, {year}",
        SCHOOL,
        f"School # : {SCHOOL_NO}",
        f"Date : 14-08-{year} 10:21:44",
        "WAEC ... Committed to Excellence",
        "INDEX NUMBER NAME GENDER DOB RESULTS",
    ]
    buckets, failures = {}, 0
    people = []
    for i in range(count):
        female = rng.random() < 0.52
        while True:
            first = rng.choice(FIRST_F if female else FIRST_M)
            middle = rng.choice(FIRST_F if female else FIRST_M)
            name = f"{rng.choice(SURNAMES)} {first}" + (f" {middle}" if rng.random() < 0.4 and middle != first else "")
            if name not in used:
                used.add(name)
                break
        people.append((name.upper(), female))
    people.sort()
    for i, (name, female) in enumerate(people, start=1):
        prog = rng.choice(list(PROGRAMMES))
        ability = rng.gauss(0, 1.6)
        subjects = CORE + PROGRAMMES[prog]
        pairs = []
        for s in subjects:
            g = "X" if rng.random() < 0.004 else grade_for(ability, s, mean, rng)
            pairs.append((s, g))
        passes = sum(1 for _, g in pairs if g not in ("F9", "X"))
        if passes == 0:
            failures += 1
        else:
            buckets[passes] = buckets.get(passes, 0) + 1
        dob = f"{rng.randint(1, 28):02d}/{rng.randint(1, 12):02d}/{year - rng.choice([18, 19, 19, 20])}"
        lines.append(f"{SCHOOL_NO}{i:03d}")
        lines.append(name)
        lines.append(f"{'Female' if female else 'Male'}{dob}")
        lines.extend(wrap(" , ".join(f"{s} - {g}" for s, g in pairs)))
    lines.append(f"Total Number of Candidates: {count}")
    lines.append("SUMMARY OF SUBJECT PASSES")
    for n in range(8, 0, -1):
        lines.append(f"{n} PASSES:{buckets.get(n, 0)}")
    lines += [f"FAILURES:{failures}", "ABSENT:0", "ENTIRE RESULTS WITHHELD:0",
              "ENTIRE RESULTS PENDING:0", "CANDIDATE OWING FEES:0",
              "ENTIRE RESULTS BLOCKED:0", "ENTIRE RESULTS CANCELLED:0"]
    return "\n".join(lines) + "\n"


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out.mkdir(parents=True, exist_ok=True)
    for year, (count, mean) in YEARS.items():
        rng = random.Random(year * 7919)
        (out / f"listing_{year}.txt").write_text(build(year, count, mean, rng))
        print(f"wrote listing_{year}.txt ({count} candidates)")


if __name__ == "__main__":
    main()
