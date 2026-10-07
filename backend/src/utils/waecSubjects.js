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

// Returns { name, recognized } — recognized=false means this subject
// wasn't in the map above and the caller should surface a warning.
function normalizeSubjectName(rawLabel) {
  const key = rawLabel.trim().toUpperCase().replace(/\s+/g, ' ');
  if (WAEC_SUBJECT_NAMES[key]) return { name: WAEC_SUBJECT_NAMES[key], recognized: true };
  return { name: titleCase(rawLabel.trim()), recognized: false };
}

module.exports = { WAEC_SUBJECT_NAMES, WAEC_CORE_SUBJECTS, WAEC_GRADE_CODES, normalizeSubjectName };
