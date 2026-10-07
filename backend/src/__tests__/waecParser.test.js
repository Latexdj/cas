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

// A real Ctrl+A browser copy-paste of the live results page (not a PDF
// upload) — a user reported a wall of "malformed grade" warnings when
// pasting this. Two things differ from every pdf-parse fixture above:
// "INTEGRATED SCIENCE" consistently has NO hyphen before its grade (every
// occurrence in the real paste reads "INTEGRATED SCIENCE F9", not
// "INTEGRATED SCIENCE - F9" — a line-wrap quirk specific to that subject
// in this extraction path), and the repeating page header gets scrambled
// into separate, reordered single-field lines ("RESULTS" / "INDEX NUMBER"
// / "NAME" / "GENDER DOB" each on their own line, in that order) instead
// of pdf-parse's one concatenated line.
const BROWSER_PASTE_SAMPLE = `INDEX NUMBER NAME GENDER DOB RESULTS
0100505001 ABUBAKARI
KAMILATU Female 03/05/2001
SOCIAL STUDIES - F9 ,
ENGLISH LANG - F9 ,
MATHEMATICS(CORE) - F9
, INTEGRATED SCIENCE
F9 , ECONOMICS - F9 ,
BIOLOGY - F9 , FOODS &
NUTRITION - F9 , MGT
IN LIVING - F9
0100505002 ADAMS
HALILAT Female 24/05/2001
SOCIAL STUDIES - B2 ,
ENGLISH LANG - C6 ,
MATHEMATICS(CORE) - F9
, INTEGRATED SCIENCE
E8 , CHRISTIAN REL
STUD - C5 , ECONOMICS- F9 , HISTORY - C6 ,
LIT-IN-ENGLISH - E8
0100505009 BAWAALE-ERE
MILLICENT
KYEN-NIBE
Female 15/07/2003 SOCIAL STUDIES - D7 ,
ENGLISH LANG - D7 ,
MATHEMATICS(CORE) - F9
, INTEGRATED SCIENCE
Total Number of Candidates: 3
2/27/25, 12:02 PM WAEC Results Listing
resultslisting.waecgh.org/search 2/13
2/27/25, 12:02 PM
WAEC Results Listing
RESULTS
INDEX NUMBER
NAME
GENDER DOB
F9 , ECONOMICS - F9 ,
BIOLOGY - F9 , FOODS &
NUTRITION - C5 , MGT
IN LIVING - E8
Total Number of Candidates: 3
`;

// Real tail text from the 2024 listing's own trailing "SUMMARY OF SUBJECT
// PASSES" block, exactly as pdf-parse extracted it — no space around the
// colon here, unlike the per-page "Total Number of Candidates: N" footer
// earlier in the same document, which does have one.
const WITH_OFFICIAL_SUMMARY = `
INDEX NUMBERNAMEGENDERDOBRESULTS
0100505001
TEST CANDIDATE
Female01/01/2005
MATHEMATICS(CORE) - C6 ,
ENGLISH LANG - F9
Total Number of Candidates:1
8 PASSES:0
7 PASSES:2
6 PASSES:4
5 PASSES:6
4 PASSES:9
3 PASSES:11
2 PASSES:7
1 PASSES:4
FAILURES:4
ABSENT:1
ENTIRE RESULTS WITHHELD:0
ENTIRE RESULTS PENDING:0
CANDIDATE OWING FEES:0
ENTIRE RESULTS BLOCKED:0
ENTIRE RESULTS CANCELLED:0
DISCLAIMER:
The result listing are provisional at the time of release. The final results are those which will be printed on the candidate's certificate.
SUMMARY OF SUBJECT PASSES
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

describe('Browser copy-paste (not a PDF upload)', () => {
  it('parses all 3 candidates with zero warnings', () => {
    const result = parseWaecListing(BROWSER_PASTE_SAMPLE);
    expect(result.warnings).toEqual([]);
    expect(result.candidates).toHaveLength(3);
  });

  it('parses a hyphen-less "INTEGRATED SCIENCE <grade>" correctly', () => {
    const result = parseWaecListing(BROWSER_PASTE_SAMPLE);
    const c1 = result.candidates.find(c => c.indexNumber === '0100505001');
    expect(c1.grades.find(g => g.subjectName === 'Integrated Science')?.grade).toBe('F9');
  });

  it('stitches a candidate split across the scrambled/reordered page header, not just the pdf-parse header shape', () => {
    const result = parseWaecListing(BROWSER_PASTE_SAMPLE);
    const c9 = result.candidates.find(c => c.indexNumber === '0100505009');
    expect(c9.name).toBe('BAWAALE-ERE MILLICENT KYEN-NIBE');
    expect(c9.grades).toHaveLength(8);
    expect(c9.grades.map(g => g.grade)).toEqual(['D7', 'D7', 'F9', 'F9', 'F9', 'F9', 'C5', 'E8']);
  });

  it('strips a page-fraction and the footer URL when they land on separate lines with no trailing comma after the last grade', () => {
    // Real quirk: when a candidate's last subject on a page has no comma
    // after it, and the page-fraction ("N/M") and the footer URL get torn
    // onto two separate lines (fraction first, URL second — the reverse
    // of the combined "URL N/M" line the other fixtures show), neither
    // half matched the combined noise pattern, so the leftover text
    // stayed glued onto that candidate's last grade (reported as
    // "MGT IN LIVING - E8 3/13 resultslisting.waecgh.org/search").
    const fixture = `
INDEX NUMBER NAME GENDER DOB RESULTS
0100505009 BAWAALE-ERE
MILLICENT
KYEN-NIBE
Female 15/07/2003 SOCIAL STUDIES - D7 ,
ENGLISH LANG - D7 ,
MATHEMATICS(CORE) - F9 ,
ECONOMICS - F9 ,
BIOLOGY - F9 , FOODS &
NUTRITION - C5 , MGT
IN LIVING - E8
3/13
resultslisting.waecgh.org/search
Total Number of Candidates: 1
`;
    const result = parseWaecListing(fixture);
    expect(result.warnings).toEqual([]);
    const mgt = result.candidates[0].grades.find(g => g.subjectName === 'Management in Living');
    expect(mgt.grade).toBe('E8');
  });
});

describe("WAEC's own printed summary block", () => {
  it('is null when the listing text was never scrolled/pasted down to that block', () => {
    const result = parseWaecListing(TWO_ORDINARY_CANDIDATES);
    expect(result.officialSummary).toBeNull();
  });

  it('parses every field exactly from the real 2024 listing tail text, including the no-space colon formatting', () => {
    const result = parseWaecListing(WITH_OFFICIAL_SUMMARY);
    expect(result.officialSummary).toEqual({
      totalCandidates: 1,
      buckets: { 1: 4, 2: 7, 3: 11, 4: 9, 5: 6, 6: 4, 7: 2, 8: 0 },
      failures: 4,
      absent: 1,
      entireResultsWithheld: 0,
      entireResultsPending: 0,
      candidateOwingFees: 0,
      entireResultsBlocked: 0,
      entireResultsCancelled: 0,
    });
  });
});

describe('Subject-name canonicalization is punctuation/spacing-agnostic', () => {
  // Fixing "LIT-IN ENGLISH" (space, from a real browser-paste warning) as
  // its own special case would only patch that one subject for this one
  // trial school — other schools' subject combinations will hit the same
  // KIND of extraction variance on subjects this fixture set has never
  // seen. The lookup itself needs to tolerate hyphen/space/punctuation
  // differences generally, not grow a special case per subject per quirk.
  it('matches a subject whose hyphen became a space in a different extraction path', () => {
    const fixture = `
INDEX NUMBER NAME GENDER DOB RESULTS
0100505001 TEST CANDIDATE Female 01/01/2005
LIT-IN ENGLISH - B2
Total Number of Candidates: 1
`;
    const result = parseWaecListing(fixture);
    expect(result.warnings.some(w => w.type === 'unrecognized_subject')).toBe(false);
    expect(result.candidates[0].grades[0].subjectName).toBe('Literature in English');
  });

  it('still flags a genuinely new subject as unrecognized rather than silently guessing', () => {
    const fixture = `
INDEX NUMBER NAME GENDER DOB RESULTS
0100505001 TEST CANDIDATE Female 01/01/2005
ELECTIVE MATHEMATICS - B2
Total Number of Candidates: 1
`;
    const result = parseWaecListing(fixture);
    expect(result.warnings.some(w => w.type === 'unrecognized_subject')).toBe(true);
    expect(result.candidates[0].grades[0].subjectName).toBe('Elective Mathematics');
  });
});
