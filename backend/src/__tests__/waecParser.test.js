'use strict';
/**
 * WAEC results listing parser (waecParser.js). Fixtures below are real
 * extracted text from actual WAEC results listings (via pdf-parse on the
 * real PDFs), not hand-typed approximations — this matters because the
 * real extraction has non-obvious quirks a hand-typed fixture would miss:
 * zero whitespace between adjacent table cells ("Female11/05/2004",
 * "0100505009EREYI VIDA"), mid-word hyphen line-wraps ("LIT-" + "IN-
 * ENGLISH" -> "LIT-IN-ENGLISH"), and a candidate's subject list split
 * across a page boundary with no new index number before the
 * continuation. The "Total Number of Candidates" line in each fixture is
 * adjusted to match the trimmed candidate count (the real documents say
 * 23/50/28 for their full candidate lists) so count-mismatch isn't
 * spuriously triggered by trimming the fixture down for readability.
 */

const { parseWaecListing } = require('../utils/waecParser');

// Real header + candidates 1, 2 (both ordinary, single-page) from the 2023
// listing, exactly as pdf-parse extracted it.
const TWO_ORDINARY_CANDIDATES = `
3/27/24, 11:51 AMWAEC Results Listing
https://resultslisting.waecgh.org/search1/7
The West African Examinations Council
THE WEST AFRICAN SENIOR SCHOOL CERTIFICATE RESULTS LISTING, 2023
ST. AUGUSTINE'S SENIOR HIGH/TECH. SCHOOL
School # : 0100505
Date : 27-03-2024 11:49:17
WAEC ... Committed to Excellence

3/27/24, 11:51 AMWAEC Results Listing
https://resultslisting.waecgh.org/search2/7
INDEX NUMBERNAMEGENDERDOBRESULTS
0100505001
ABDUL-WAHAB
RAHAMA
DIPANTICHE
Female11/05/2004
SOCIAL STUDIES - C6 ,
ENGLISH LANG - D7 ,
MATHEMATICS(CORE) -
E8 , INTEGRATED
SCIENCE - F9 ,
CHRISTIAN REL STUD -
F9 , ECONOMICS - D7 ,
HISTORY - F9 , LIT-
IN-ENGLISH - F9
0100505002
ADAMU FADILA
AZAASUMA
Female07/06/2004
SOCIAL STUDIES - E8 ,
ENGLISH LANG - F9 ,
MATHEMATICS(CORE) -
F9 , INTEGRATED
SCIENCE - F9 ,
ECONOMICS - F9 ,
BIOLOGY - F9 , FOODS
& NUTRITION - D7 ,
MGT IN LIVING - D7
Total Number of Candidates: 2
`;

// Real header + candidates 1-8 through the page break that splits
// candidate 8 (DORPILAA)'s results across pages 2 and 3 — the exact
// scenario that originally broke the index-number boundary regex (a
// trailing \b doesn't fire between a digit and an immediately-following
// letter, e.g. "0100505009EREYI", silently merging candidate 9 into
// candidate 8's block).
const CROSS_PAGE_BREAK = `
3/27/24, 11:51 AMWAEC Results Listing
https://resultslisting.waecgh.org/search1/7
The West African Examinations Council
THE WEST AFRICAN SENIOR SCHOOL CERTIFICATE RESULTS LISTING, 2023
ST. AUGUSTINE'S SENIOR HIGH/TECH. SCHOOL
School # : 0100505
Date : 27-03-2024 11:49:17
WAEC ... Committed to Excellence

3/27/24, 11:51 AMWAEC Results Listing
https://resultslisting.waecgh.org/search2/7
INDEX NUMBERNAMEGENDERDOBRESULTS
0100505007
DANTIINA
CORNELLIA
Female25/04/2003
SOCIAL STUDIES - C4 ,
ENGLISH LANG - C6 ,
MATHEMATICS(CORE) -
F9 , INTEGRATED
SCIENCE - E8 ,
ECONOMICS - C6 ,
BIOLOGY - F9 , FOODS
& NUTRITION - B3 ,
MGT IN LIVING - C4
0100505008
DORPILAA
FELICIA ANG-
SINGDIIBU
Female31/07/2002
SOCIAL STUDIES - C6 ,
ENGLISH LANG - E8 ,
MATHEMATICS(CORE) -
F9 , INTEGRATED
SCIENCE - F9 ,
Total Number of Candidates: 3

3/27/24, 11:51 AMWAEC Results Listing
https://resultslisting.waecgh.org/search3/7
INDEX NUMBERNAMEGENDERDOBRESULTS
ECONOMICS - C5 ,
BIOLOGY - E8 , FOODS
& NUTRITION - C6 ,
MGT IN LIVING - C5
Total Number of Candidates: 3

3/27/24, 11:51 AMWAEC Results Listing
https://resultslisting.waecgh.org/search4/7
INDEX NUMBERNAMEGENDERDOBRESULTS
0100505009EREYI VIDA
Female27/09/2004
SOCIAL STUDIES - F9 ,
ENGLISH LANG - F9 ,
MATHEMATICS(CORE) -
F9 , INTEGRATED
SCIENCE - F9 ,
ECONOMICS - E8 ,
BIOLOGY - F9 , FOODS
& NUTRITION - C6 ,
MGT IN LIVING - C6
Total Number of Candidates: 3
`;

// Real excerpt from the 2024 listing — a candidate whose entire result
// set is 'X' (cancelled/withheld), including the same mid-word hyphen
// wrap pattern on "LIT-IN-ENGLISH".
const ALL_CANCELLED_CANDIDATE = `
2/27/25, 12:02 PMWAEC Results Listing
resultslisting.waecgh.org/search1/13
The West African Examinations Council
THE WEST AFRICAN SENIOR SCHOOL CERTIFICATE RESULTS LISTING, 2024
ST. AUGUSTINE'S SENIOR HIGH/TECH. SCHOOL
School # : 0100505
Date : 27-02-2025 12:04:30
WAEC ... Committed to Excellence

INDEX NUMBERNAMEGENDERDOBRESULTS
0100505032
KUUKABANONA
WADUD
Male04/06/2004
SOCIAL STUDIES - X ,
ENGLISH LANG - X ,
MATHEMATICS(CORE) - X
, INTEGRATED SCIENCE -
X , CHRISTIAN REL STUD
- X , ECONOMICS - X ,
HISTORY - X , LIT-IN-
ENGLISH - X
Total Number of Candidates: 1
`;

// Real excerpt from the 2025 listing — a candidate name itself contains a
// mid-word hyphen wrap ("ADAMA N-" + "MANKU-ANU" -> "ADAMA N-MANKU-ANU"),
// distinct from the subject-name wrap case above.
const HYPHENATED_NAME = `
INDEX NUMBERNAMEGENDERDOBRESULTS
0100505001
ADAMA N-
MANKU-ANU
Female08/04/2004
SOCIAL STUDIES - F9 ,
ENGLISH LANG - E8 ,
MATHEMATICS(CORE) - F9 ,
INTEGRATED SCIENCE - F9 ,
ECONOMICS - F9 , BIOLOGY -
F9 , FOODS & NUTRITION - D7
, MGT IN LIVING - F9
Total Number of Candidates: 1
`;

describe('Header metadata', () => {
  it('extracts school name, school number, and year', () => {
    const result = parseWaecListing(TWO_ORDINARY_CANDIDATES);
    expect(result.schoolName).toBe("ST. AUGUSTINE'S SENIOR HIGH/TECH. SCHOOL");
    expect(result.schoolNumber).toBe('0100505');
    expect(result.year).toBe(2023);
  });
});

describe('Ordinary candidates', () => {
  it('parses both candidates with correct names, gender, DOB, and grade counts', () => {
    const result = parseWaecListing(TWO_ORDINARY_CANDIDATES);
    expect(result.warnings).toEqual([]);
    expect(result.candidates).toHaveLength(2);

    const c1 = result.candidates[0];
    expect(c1.indexNumber).toBe('0100505001');
    expect(c1.name).toBe('ABDUL-WAHAB RAHAMA DIPANTICHE');
    expect(c1.gender).toBe('Female');
    expect(c1.dob).toBe('11/05/2004');
    expect(c1.grades).toHaveLength(8);
    // Confirms the mid-word hyphen wrap "LIT-" + "IN-ENGLISH" rejoins to
    // the real subject name, not two separate garbled fragments.
    expect(c1.grades.find(g => g.subjectName === 'Literature in English')?.grade).toBe('F9');
  });

  it('normalizes known subject labels to their display names', () => {
    const result = parseWaecListing(TWO_ORDINARY_CANDIDATES);
    const c2 = result.candidates[1];
    const names = c2.grades.map(g => g.subjectName);
    expect(names).toEqual(expect.arrayContaining(['Social Studies', 'English Language', 'Mathematics', 'Food and Nutrition', 'Management in Living']));
  });
});

describe('Cross-page-break candidate', () => {
  it('stitches a results list split across a page boundary into one candidate, and does not swallow the next candidate', () => {
    const result = parseWaecListing(CROSS_PAGE_BREAK);
    expect(result.warnings).toEqual([]);
    expect(result.candidates).toHaveLength(3);

    const dorpilaa = result.candidates.find(c => c.indexNumber === '0100505008');
    expect(dorpilaa.name).toBe('DORPILAA FELICIA ANG-SINGDIIBU');
    expect(dorpilaa.grades).toHaveLength(8);
    expect(dorpilaa.grades.map(g => g.grade)).toEqual(['C6', 'E8', 'F9', 'F9', 'C5', 'E8', 'C6', 'C5']);

    // The next candidate (whose index number is glued directly onto the
    // previous line with no space: "0100505009EREYI VIDA") must be its
    // own, correctly separated candidate — this is the exact case that
    // silently merged into the previous candidate's block before the
    // index-number regex was fixed to not require a trailing \b.
    const ereyi = result.candidates.find(c => c.indexNumber === '0100505009');
    expect(ereyi).toBeDefined();
    expect(ereyi.name).toBe('EREYI VIDA');
    expect(ereyi.grades).toHaveLength(8);
  });
});

describe('Cancelled results (grade = X)', () => {
  it('parses an all-X candidate without treating X as an unrecognized grade', () => {
    const result = parseWaecListing(ALL_CANCELLED_CANDIDATE);
    expect(result.warnings).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    const c = result.candidates[0];
    expect(c.grades).toHaveLength(8);
    expect(c.grades.every(g => g.grade === 'X')).toBe(true);
  });
});

describe('Hyphenated candidate name', () => {
  it('rejoins a name split mid-hyphen across lines correctly', () => {
    const result = parseWaecListing(HYPHENATED_NAME);
    expect(result.warnings).toEqual([]);
    expect(result.candidates[0].name).toBe('ADAMA N-MANKU-ANU');
  });
});

describe('Unrecognized subjects and malformed input', () => {
  it('flags a subject not in the normalization map as a warning but still imports it', () => {
    const fixture = `
INDEX NUMBERNAMEGENDERDOBRESULTS
0100505099
TEST CANDIDATE
Female01/01/2005
FRENCH - B2 ,
MATHEMATICS(CORE) - A1
Total Number of Candidates: 1
`;
    const result = parseWaecListing(fixture);
    expect(result.candidates).toHaveLength(1);
    expect(result.warnings.some(w => w.type === 'unrecognized_subject')).toBe(true);
    expect(result.candidates[0].grades.find(g => g.subjectRaw === 'FRENCH').subjectName).toBe('French');
  });

  it('flags a declared-vs-parsed candidate count mismatch', () => {
    const fixture = `
INDEX NUMBERNAMEGENDERDOBRESULTS
0100505099
TEST CANDIDATE
Female01/01/2005
MATHEMATICS(CORE) - A1
Total Number of Candidates: 5
`;
    const result = parseWaecListing(fixture);
    expect(result.warnings.some(w => w.type === 'count_mismatch')).toBe(true);
  });

  it('flags a duplicate index number appearing twice in the same listing', () => {
    const fixture = `
INDEX NUMBERNAMEGENDERDOBRESULTS
0100505001
FIRST CANDIDATE
Female01/01/2005
MATHEMATICS(CORE) - A1
0100505001
SECOND CANDIDATE
Male02/02/2005
MATHEMATICS(CORE) - B2
Total Number of Candidates: 2
`;
    const result = parseWaecListing(fixture);
    expect(result.warnings.some(w => w.type === 'duplicate_candidate')).toBe(true);
  });
});
