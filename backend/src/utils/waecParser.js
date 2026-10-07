'use strict';
const { WAEC_GRADE_CODES, normalizeSubjectName } = require('./waecSubjects');

// Lines that are pure page-break artifacts in a pdf-parse/copy-paste
// extraction of a WAEC results listing — verified against real extracted
// text from three actual PDF listings AND a real browser copy-paste of
// the live results page, which turned out to serialize the exact same
// repeating header+date/time block completely differently: pdf-parse
// keeps "INDEX NUMBER NAME GENDER DOB RESULTS" as one line and
// "<date>, <time> WAEC Results Listing" as another, but a browser Ctrl+A
// copy was observed splitting AND reordering that same block into
// separate single-field lines ("RESULTS" / "INDEX NUMBER" / "NAME" /
// "GENDER DOB", date and "WAEC Results Listing" on their own lines too) —
// both shapes are matched here since either extraction path can produce
// either one. Both a pre-https and a https-prefixed form of the footer
// URL were observed across different years, hence the optional scheme.
const NOISE_LINE_PATTERNS = [
  /^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*[AP]M\s*WAEC Results Listing$/i,
  /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}\s*[AP]M$/i,
  /^WAEC Results Listing$/i,
  /^(https?:\/\/)?resultslisting\.waecgh\.org\/search\s*\d+\/\d+$/i,
  // The page-fraction and the URL were also observed torn onto two
  // separate lines, in that order ("3/13" alone, then
  // "resultslisting.waecgh.org/search" alone on the next line) — neither
  // half matches the combined pattern above on its own, and with no
  // trailing comma after the candidate's last grade on that page, the
  // leftover text stayed glued onto it instead of being stripped
  // (e.g. "MGT IN LIVING - E8 3/13 resultslisting.waecgh.org/search").
  /^\d{1,3}\/\d{1,3}$/,
  /^(https?:\/\/)?resultslisting\.waecgh\.org\/search$/i,
  /^INDEX NUMBER\s*NAME\s*GENDER\s*DOB\s*RESULTS$/i,
  /^INDEX NUMBER$/i,
  /^NAME$/i,
  /^GENDER\s*DOB$/i,
  /^RESULTS$/i,
  /^WAEC\s*\.\.\.\s*Committed to Excellence$/i,
];

const TOTAL_CANDIDATES_RE = /^Total Number of Candidates:\s*(\d+)$/i;
// WAEC's own trailing "SUMMARY OF SUBJECT PASSES" block — confirmed
// against the real extracted text of all three sample PDFs. It always
// follows the LAST "Total Number of Candidates" line, one field per line,
// colon-separated with no consistent spacing (pdf-parse renders this
// block with no space around the colon — "FAILURES:4" — even though the
// per-page footer repeating the same "Total Number of Candidates" line
// earlier in the document has a space; \s* tolerates both). This is
// parsed as a SEPARATE, trusted source alongside our own computed
// buckets/failures rather than replacing them — see examResultsReport.js
// for why: hand-checking this exact block against the real 23-candidate
// 2023 dataset found our own computed N-PASSES buckets match WAEC's
// printed ones exactly, but WAEC's own FAILURES figure does not equal
// "count of candidates with zero non-F9 subjects" (nor zero-credits, nor
// a core-subject-failure definition) — WAEC is evidently counting
// something we can't reverse-engineer from the grades alone, so its
// printed number is surfaced as-is rather than guessed at.
const PASS_BUCKET_RE = /^(\d{1,2})\s*PASSES\s*:\s*(\d+)$/i;
const SUMMARY_SCALAR_FIELDS = [
  ['failures', /^FAILURES\s*:\s*(\d+)$/i],
  ['absent', /^ABSENT\s*:\s*(\d+)$/i],
  ['entireResultsWithheld', /^ENTIRE RESULTS WITHHELD\s*:\s*(\d+)$/i],
  ['entireResultsPending', /^ENTIRE RESULTS PENDING\s*:\s*(\d+)$/i],
  ['candidateOwingFees', /^CANDIDATE OWING FEES\s*:\s*(\d+)$/i],
  ['entireResultsBlocked', /^ENTIRE RESULTS BLOCKED\s*:\s*(\d+)$/i],
  ['entireResultsCancelled', /^ENTIRE RESULTS CANCELLED\s*:\s*(\d+)$/i],
];

// Returns null when none of these lines matched anything — e.g. a paste
// that only covers the candidate table and was never scrolled/selected
// down to this trailing block. Never invented or defaulted: downstream
// code must treat "WAEC's own summary wasn't captured" as a real,
// distinct state from "every figure in it happens to be zero."
function parseOfficialSummary(lines) {
  const summary = { buckets: {} };
  let found = false;
  for (const line of lines) {
    const bucketMatch = line.match(PASS_BUCKET_RE);
    if (bucketMatch) {
      summary.buckets[parseInt(bucketMatch[1], 10)] = parseInt(bucketMatch[2], 10);
      found = true;
      continue;
    }
    for (const [key, re] of SUMMARY_SCALAR_FIELDS) {
      const m = line.match(re);
      if (m) { summary[key] = parseInt(m[1], 10); found = true; break; }
    }
  }
  return found ? summary : null;
}
// Index numbers are a fixed 10 digits (7-digit school code + 3-digit
// candidate sequence) in every sample seen. Deliberately NOT using a
// trailing \b — a 10-digit run is frequently glued directly onto the next
// candidate's name with no space in the extracted text (e.g.
// "0100505009EREYI VIDA"), and \b doesn't fire between a digit and a
// letter (both are \w), so a plain \b\d{9,10}\b silently missed those
// candidates entirely, merging them into the previous one's block.
const INDEX_NUMBER_RE = /(?<!\d)\d{10}(?!\d)/g;
const GENDER_DOB_RE = /(Male|Female)\s*(\d{2}\/\d{2}\/\d{4})/;
const GRADE_ALTERNATION = WAEC_GRADE_CODES.join('|');
// The hyphen is optional — a real browser copy-paste was observed
// consistently dropping it for "INTEGRATED SCIENCE" specifically (every
// occurrence in that paste read "INTEGRATED SCIENCE F9", not
// "INTEGRATED SCIENCE - F9"), while every other subject kept its hyphen.
// Likely a line-wrap quirk specific to how that subject's column breaks,
// not something worth chasing further — just accept either shape.
const RESULT_PAIR_RE = new RegExp(`^(.+?)\\s*-?\\s*(${GRADE_ALTERNATION})$`, 'i');

// Joins consecutive text fragments the way the original PDF layout
// intended: a fragment ending in '-' was a mid-word line wrap (e.g.
// "LIT-IN-" + "ENGLISH" -> "LIT-IN-ENGLISH", "ADAMA N-" + "MANKU-ANU" ->
// "ADAMA N-MANKU-ANU"), anything else was a real word/field break and
// needs a space.
function joinFragments(lines) {
  let out = '';
  for (const line of lines) {
    if (!out) { out = line; continue; }
    out += out.endsWith('-') ? line : ` ${line}`;
  }
  return out;
}

function extractHeaderMetadata(lines) {
  let schoolName = null, schoolNumber = null, year = null;
  for (const line of lines) {
    const yearMatch = line.match(/RESULTS LISTING,\s*(\d{4})/i);
    if (yearMatch) year = parseInt(yearMatch[1], 10);
    const numMatch = line.match(/School\s*#\s*:\s*(\S+)/i);
    if (numMatch) schoolNumber = numMatch[1];
    // The school name is the line immediately before "School # : ..." in
    // every sample — identified positionally rather than by a fixed
    // pattern, since the name itself has no distinguishing marker.
  }
  const schoolNumberIdx = lines.findIndex(l => /School\s*#\s*:/i.test(l));
  if (schoolNumberIdx > 0) schoolName = lines[schoolNumberIdx - 1].trim();
  return { schoolName, schoolNumber, year };
}

// Parses a WAEC results listing's extracted/pasted text into structured
// candidate records. Fed either by pdf-parse output (upload path) or a
// raw paste (paste path) — both converge here.
function parseWaecListing(rawText) {
  const warnings = [];
  const allLines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  const headerEndIdx = allLines.findIndex(l => /^INDEX NUMBER\s*NAME\s*GENDER\s*DOB\s*RESULTS$/i.test(l));
  const { schoolName, schoolNumber, year } = extractHeaderMetadata(
    headerEndIdx >= 0 ? allLines.slice(0, headerEndIdx) : allLines
  );

  // The summary section ("8 PASSES: N", "FAILURES: N", the disclaimer,
  // etc.) always follows the LAST "Total Number of Candidates" line —
  // candidate parsing truncates there (that section isn't candidate data),
  // but the lines after it are separately parsed below into
  // officialSummary rather than being discarded outright.
  let declaredTotal = null;
  let lastTotalIdx = -1;
  allLines.forEach((l, i) => {
    const m = l.match(TOTAL_CANDIDATES_RE);
    if (m) { declaredTotal = parseInt(m[1], 10); lastTotalIdx = i; }
  });
  const bodyLines = (lastTotalIdx >= 0 ? allLines.slice(0, lastTotalIdx) : allLines)
    .filter(l => !NOISE_LINE_PATTERNS.some(re => re.test(l)) && !TOTAL_CANDIDATES_RE.test(l));
  const officialSummary = lastTotalIdx >= 0 ? parseOfficialSummary(allLines.slice(lastTotalIdx + 1)) : null;
  if (officialSummary) officialSummary.totalCandidates = declaredTotal;

  const joined = joinFragments(bodyLines);

  const indexMatches = [...joined.matchAll(INDEX_NUMBER_RE)];
  const candidates = [];

  for (let i = 0; i < indexMatches.length; i++) {
    const indexNumber = indexMatches[i][0];
    const blockStart = indexMatches[i].index + indexNumber.length;
    const blockEnd = i + 1 < indexMatches.length ? indexMatches[i + 1].index : joined.length;
    const block = joined.slice(blockStart, blockEnd).trim();

    const genderMatch = block.match(GENDER_DOB_RE);
    if (!genderMatch) {
      warnings.push({ type: 'parse_failure', indexNumber, message: 'Could not find a Gender/DOB field for this candidate — skipped.' });
      continue;
    }

    const name = block.slice(0, genderMatch.index).replace(/\s+/g, ' ').trim();
    const gender = genderMatch[1];
    const dob = genderMatch[2];
    const resultsText = block.slice(genderMatch.index + genderMatch[0].length).trim();

    if (!name) warnings.push({ type: 'parse_failure', indexNumber, message: 'No name found for this candidate.' });

    const grades = [];
    const seenSubjects = new Set();
    for (const piece of resultsText.split(',')) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      const m = trimmed.match(RESULT_PAIR_RE);
      if (!m) {
        warnings.push({ type: 'malformed_grade', indexNumber, message: `Could not parse "${trimmed}" as a subject/grade pair.` });
        continue;
      }
      const subjectRaw = m[1].trim();
      const grade = m[2].toUpperCase();
      const { name: subjectName, recognized } = normalizeSubjectName(subjectRaw);
      if (!recognized) warnings.push({ type: 'unrecognized_subject', indexNumber, message: `"${subjectRaw}" is not a recognized subject — imported as "${subjectName}".` });
      if (seenSubjects.has(subjectName)) {
        warnings.push({ type: 'duplicate_subject', indexNumber, message: `"${subjectName}" appears more than once for this candidate.` });
        continue;
      }
      seenSubjects.add(subjectName);
      grades.push({ subjectRaw, subjectName, grade });
    }

    if (!grades.length) warnings.push({ type: 'parse_failure', indexNumber, message: 'No subject grades found for this candidate.' });

    candidates.push({ indexNumber, name, gender, dob, grades });
  }

  const indexNumbers = candidates.map(c => c.indexNumber);
  const dupes = indexNumbers.filter((v, i) => indexNumbers.indexOf(v) !== i);
  for (const dup of [...new Set(dupes)]) {
    warnings.push({ type: 'duplicate_candidate', indexNumber: dup, message: 'This index number appears more than once in the listing.' });
  }

  if (declaredTotal !== null && declaredTotal !== candidates.length) {
    warnings.push({
      type: 'count_mismatch',
      message: `The listing declares ${declaredTotal} candidates, but ${candidates.length} were parsed.`,
    });
  }

  return { schoolName, schoolNumber, year, declaredTotal, candidates, warnings, officialSummary };
}

module.exports = { parseWaecListing };
