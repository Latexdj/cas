// Maps WAEC's raw printed subject labels (as they appear in a results
// listing) to a clean display name. Built from three real years of this
// school's listings (2023-2025) — covers every subject seen so far. A
// label not in this map still gets imported (title-cased, used as-is) but
// is flagged as an "unrecognized subject" warning by the parser, so
// coverage gaps surface instead of silently mislabeling something.
const WAEC_SUBJECT_NAMES = {
  'ENGLISH LANG': 'English Language',
  'MATHEMATICS(CORE)': 'Mathematics',
  'INTEGRATED SCIENCE': 'Integrated Science',
  'SOCIAL STUDIES': 'Social Studies',
  'ECONOMICS': 'Economics',
  'LIT-IN-ENGLISH': 'Literature in English',
  'CHRISTIAN REL STUD': 'Christian Religious Studies',
  'HISTORY': 'History',
  'MGT IN LIVING': 'Management in Living',
  'BIOLOGY': 'Biology',
  'FOODS & NUTRITION': 'Food and Nutrition',
  // A results LISTING prints WAEC's own abbreviated codes (above); a
  // school's own Excel Analysis Report spells subjects out in full
  // instead (waecExcelAggregateParser.js's source). Both need to resolve
  // to the same canonical name or the same subject fragments into two
  // separate entries across years in Analytics.
  'ENGLISH LANGUAGE': 'English Language',
  'MATHEMATICS': 'Mathematics',
  'CHRISTIAN RELIGIOUS STUDIES': 'Christian Religious Studies',
  'MANAGEMENT IN LIVING': 'Management in Living',
  'FOOD AND NUTRITION': 'Food and Nutrition',
  'LITERATURE IN ENGLISH': 'Literature in English',
};

// The four subjects every WASSCE candidate takes, regardless of program —
// used to split the Analysis Report into its "Core" / "Electives" sections.
const WAEC_CORE_SUBJECTS = ['English Language', 'Mathematics', 'Integrated Science', 'Social Studies'];

// WAEC grade codes, in the order they appear in a results listing. 'X'
// denotes a cancelled/withheld paper — not a real grade, handled
// separately from the grade_boundaries lookup (which only has A1-F9).
const WAEC_GRADE_CODES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9', 'X'];

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Collapses punctuation/spacing variance (hyphen vs space vs double space,
// "&" vs "AND", parenthesised qualifiers) down to one comparable form, so
// a lookup isn't defeated by cosmetic differences in how a given
// extraction path happened to serialize the same subject name. Found
// necessary when a browser copy-paste rendered "LIT-IN-ENGLISH" (the PDF
// extraction's form) as "LIT-IN ENGLISH" instead — a different subject
// hitting the same kind of variance (this school doesn't offer every
// WAEC subject; others will) would otherwise need its own special case
// added by hand every time, which doesn't scale and was never going to
// cover a school whose combination we haven't seen yet.
function canonicalize(label) {
  return label.toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, ' ').trim();
}

const CANONICAL_LOOKUP = new Map(
  Object.entries(WAEC_SUBJECT_NAMES).map(([raw, name]) => [canonicalize(raw), name])
);

// Returns { name, recognized } — recognized=false means this subject
// wasn't in the map above and the caller should surface a warning.
function normalizeSubjectName(rawLabel) {
  const trimmed = rawLabel.trim();
  const match = CANONICAL_LOOKUP.get(canonicalize(trimmed));
  if (match) return { name: match, recognized: true };
  return { name: titleCase(trimmed), recognized: false };
}

module.exports = { WAEC_SUBJECT_NAMES, WAEC_CORE_SUBJECTS, WAEC_GRADE_CODES, normalizeSubjectName };
