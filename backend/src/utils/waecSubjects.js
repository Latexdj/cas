// Maps WAEC's raw printed subject labels (as they appear in a results
// listing) to a clean display name. Originally built from three real years
// of one school's listings (2023-2025) only — which meant any other real
// school offering a subject that school didn't (Government, Islamic
// Religious Studies, a Ghanaian language, French, a Business or Visual Arts
// elective...) got flagged "not a recognized subject", alarming a
// non-technical reader into fearing a wrong analysis over a completely
// standard WASSCE subject. Expanded to the full WASSCE catalogue (Core,
// General Science, General Arts, Business, Home Economics, Visual Arts,
// Agriculture, Technical/Vocational, and languages) so that gap doesn't
// recur. A label still not in this map is imported (title-cased, used
// as-is) and flagged as an "unrecognized subject" warning — real coverage
// gaps still surface, they just shouldn't be the common case anymore.
const WAEC_SUBJECT_NAMES = {
  // ── Core (every candidate) ──────────────────────────────────────────────
  'ENGLISH LANG': 'English Language',
  'ENGLISH LANGUAGE': 'English Language',
  'MATHEMATICS(CORE)': 'Mathematics',
  'MATHEMATICS': 'Mathematics',
  'INTEGRATED SCIENCE': 'Integrated Science',
  'SOCIAL STUDIES': 'Social Studies',

  // ── General Science ──────────────────────────────────────────────────────
  'MATHEMATICS(ELECTIVE)': 'Mathematics (Elective)',
  'ELECTIVE MATHEMATICS': 'Mathematics (Elective)',
  'FURTHER MATHEMATICS': 'Further Mathematics',
  'PHYSICS': 'Physics',
  'CHEMISTRY': 'Chemistry',
  'BIOLOGY': 'Biology',
  'AGRICULTURAL SCIENCE': 'Agricultural Science',

  // ── General Arts ─────────────────────────────────────────────────────────
  'ECONOMICS': 'Economics',
  'GEOGRAPHY': 'Geography',
  'GOVERNMENT': 'Government',
  'HISTORY': 'History',
  'LIT-IN-ENGLISH': 'Literature in English',
  'LITERATURE IN ENGLISH': 'Literature in English',
  'CHRISTIAN REL STUD': 'Christian Religious Studies',
  'CHRISTIAN RELIGIOUS STUDIES': 'Christian Religious Studies',
  'ISLAMIC RELIGIOUS STUDIES': 'Islamic Religious Studies',
  'FRENCH': 'French',
  'ARABIC': 'Arabic',
  // Ghanaian languages
  'AKAN': 'Akan',
  'TWI': 'Akan',
  'FANTE': 'Akan',
  'DAGAARE': 'Dagaare',
  'DAGBANI': 'Dagbani',
  'DANGME': 'Dangme',
  'EWE': 'Ewe',
  'GA': 'Ga',
  'GONJA': 'Gonja',
  'KASEM': 'Kasem',
  'NZEMA': 'Nzema',

  // ── Business ─────────────────────────────────────────────────────────────
  'BUSINESS MANAGEMENT': 'Business Management',
  'FINANCIAL ACCOUNTING': 'Financial Accounting',
  'PRINCIPLE OF COST ACCOUNTING': 'Principles of Cost Accounting',
  'PRINCIPLES OF COST ACCOUNTING': 'Principles of Cost Accounting',
  'COSTING': 'Principles of Cost Accounting',
  'OFFICE PRACTICE': 'Office Practice',
  'TYPEWRITING': 'Typewriting',
  'SHORTHAND': 'Shorthand',

  // ── Home Economics ───────────────────────────────────────────────────────
  'MGT IN LIVING': 'Management in Living',
  'MANAGEMENT IN LIVING': 'Management in Living',
  'MANAGEMENT-IN-LIVING': 'Management in Living',
  'FOODS & NUTRITION': 'Food and Nutrition',
  'FOOD AND NUTRITION': 'Food and Nutrition',
  'CLOTHING & TEXTILES': 'Clothing & Textiles',
  'CLOTHING AND TEXTILES': 'Clothing & Textiles',

  // ── Visual Arts ──────────────────────────────────────────────────────────
  'GENERAL KNOWLEDGE IN ART': 'General Knowledge in Art',
  'GRAPHIC DESIGN': 'Graphic Design',
  'PICTURE MAKING': 'Picture Making',
  'LEATHERWORK': 'Leatherwork',
  'CERAMICS': 'Ceramics',
  'SCULPTURE': 'Sculpture',
  'TEXTILES': 'Textiles',
  'BASKETRY': 'Basketry',
  'JEWELLERY': 'Jewellery',
  'CARVING': 'Carving',

  // ── Agriculture ──────────────────────────────────────────────────────────
  'GENERAL AGRICULTURE': 'General Agriculture',
  'ANIMAL HUSBANDRY': 'Animal Husbandry',
  'HORTICULTURE': 'Horticulture',
  'FISHERIES': 'Fisheries',

  // ── Technical / Vocational ───────────────────────────────────────────────
  'APPLIED ELECTRICITY': 'Applied Electricity',
  'AUTO MECHANICS': 'Auto Mechanics',
  'BUILDING CONSTRUCTION': 'Building Construction',
  'ELECTRONICS': 'Electronics',
  'METAL WORK': 'Metal Work',
  'TECHNICAL DRAWING': 'Technical Drawing',
  'WOODWORK': 'Woodwork',
  'WELDING AND FABRICATION': 'Welding and Fabrication Engineering Craft Practice',
  'WELDING AND FABRICATION ENGINEERING CRAFT PRACTICE': 'Welding and Fabrication Engineering Craft Practice',
};

// The four subjects every WASSCE candidate takes, regardless of program —
// used to split the Analysis Report into its "Core" / "Electives" sections.
const WAEC_CORE_SUBJECTS = ['English Language', 'Mathematics', 'Integrated Science', 'Social Studies'];

// WAEC grade codes, in the order they appear in a results listing. 'X'
// denotes a cancelled/withheld paper and '*' a paper with no result
// recorded — neither is a real grade, both handled the same way
// (excluded from presented/pass counts) separately from the
// grade_boundaries lookup, which only has A1-F9. 'P' (seen on at least one
// real listing, e.g. a Clothing & Textiles practical) is a genuine
// pass/fail-only outcome some subjects use instead of the 9-point scale —
// unlike X/*, it's still a real result, so it stays out of that exclusion
// set and is just not matched against the A1-F9 boundaries (no pass/fail
// claim is made about it either way).
const WAEC_GRADE_CODES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9', 'X', '*', 'P'];
const NO_RESULT_GRADES = new Set(['X', '*']);

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

module.exports = { WAEC_SUBJECT_NAMES, WAEC_CORE_SUBJECTS, WAEC_GRADE_CODES, NO_RESULT_GRADES, normalizeSubjectName };
