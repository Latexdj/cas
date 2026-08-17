'use strict';
/**
 * Tests for GET /api/student/results
 *
 * Verifies:
 *   A. Live CA + exam scores for PUBLISHED subjects (correct computation)
 *   B. Multiple assessments per subject — no string-concatenation bug on caMaxRaw
 *   C. Unpublished live subjects are hidden
 *   D. Admin-imported results always show (no published gate)
 *   E. Live published data takes priority over import for same subject
 *   F. No published submissions → empty results
 */

const SCHOOL_ID  = 'sch-0000-0000-0000-000000000001';
const STUDENT_ID = 'stu-0000-0000-0000-000000000001';
const AY_ID      = 'ay-0000-0000-0000-000000000001';
const MODE_ID    = 'mode-0000-0000-0000-000000000001';

// ── mocks ───────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
jest.mock('../config/db', () => ({
  query: mockQuery,
  connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
}));
jest.mock('../middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.user     = { id: STUDENT_ID, role: 'student' };
    req.schoolId = SCHOOL_ID;
    next();
  },
  requireActiveSubscription: (_req, _res, next) => next(),
}));

const request       = require('supertest');
const express       = require('express');
const studentRouter = require('../routes/student');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/student', studentRouter);
  return app;
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const STUDENT_ROW = {
  id: STUDENT_ID, name: 'Test Student', student_code: 'S001',
  class_name: 'Form 1A', program_name: 'Science', exam_body: 'WAEC',
  gender: 'Male', picture_url: null, date_of_birth: null, hometown: null,
  residential_address: null, mobile_number: null, house: null,
  residential_status: null, guardian_name: null, guardian_mobile: null,
  guardian_occupation: null, religion: null, age: 16,
};

// ca_contribution returned as string by pg (NUMERIC type)
const MODES = [{ id: MODE_ID, name: 'Quiz', ca_contribution: '30' }];

const BOUNDARIES = [
  { exam_body: 'WAEC', grade: 'A1', min_pct: '75', max_pct: '100', remark: 'EXCELLENT'  },
  { exam_body: 'WAEC', grade: 'B2', min_pct: '70', max_pct: '74',  remark: 'VERY GOOD'  },
  { exam_body: 'WAEC', grade: 'B3', min_pct: '65', max_pct: '69',  remark: 'GOOD'       },
  { exam_body: 'WAEC', grade: 'C4', min_pct: '60', max_pct: '64',  remark: 'CREDIT'     },
  { exam_body: 'WAEC', grade: 'C5', min_pct: '55', max_pct: '59',  remark: 'CREDIT'     },
  { exam_body: 'WAEC', grade: 'C6', min_pct: '50', max_pct: '54',  remark: 'CREDIT'     },
  { exam_body: 'WAEC', grade: 'D7', min_pct: '45', max_pct: '49',  remark: 'PASS'       },
  { exam_body: 'WAEC', grade: 'E8', min_pct: '40', max_pct: '44',  remark: 'PASS'       },
  { exam_body: 'WAEC', grade: 'F9', min_pct: '0',  max_pct: '39',  remark: 'FAIL'       },
];

// ── helper ────────────────────────────────────────────────────────────────────

/**
 * Register pool.query mock return values in the exact call order of the endpoint.
 *
 * Call order:
 *  1.  getStudentProfile
 *  2.  schools  (ca_percentage)
 *  3.  assessment_modes
 *  4.  grade_boundaries
 *  5.  assessments JOIN assessment_scores
 *  6.  exam_scores
 *  7.  results_import
 *  8.  result_submissions (published subjects)
 *  9.  students (classmates) — only called when average !== null
 *  10. report_remarks
 *  11. student_attendance_records
 *
 * When average is null (filteredSubjects is empty or all totals null), call 9
 * is skipped, so only 10 mock calls are consumed.
 */
function setupMocks({
  caRows           = [],
  examRows         = [],
  importRows       = [],
  publishedSubjects = [],          // array of subject name strings
  expectAverage    = true,         // set false when filteredSubjects will be empty
  classmates       = [{ id: STUDENT_ID }],
} = {}) {
  const pubRows = publishedSubjects.map(s => ({ subject: s.toLowerCase() }));

  mockQuery
    .mockResolvedValueOnce({ rows: [STUDENT_ROW] })                           // 1
    .mockResolvedValueOnce({ rows: [{ ca_percentage: '30' }] })               // 2
    .mockResolvedValueOnce({ rows: MODES })                                   // 3
    .mockResolvedValueOnce({ rows: BOUNDARIES })                              // 4
    .mockResolvedValueOnce({ rows: caRows })                                  // 5
    .mockResolvedValueOnce({ rows: examRows })                                // 6
    .mockResolvedValueOnce({ rows: importRows })                              // 7
    .mockResolvedValueOnce({ rows: pubRows });                                // 8

  if (expectAverage) {
    mockQuery
      .mockResolvedValueOnce({ rows: classmates })                            // 9
      .mockResolvedValueOnce({ rows: [] })                                    // 10 remarks
      .mockResolvedValueOnce({ rows: [{ total: 0, present: 0, late: 0, absent: 0 }] }); // 11
  } else {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })                                    // 10 remarks
      .mockResolvedValueOnce({ rows: [{ total: 0, present: 0, late: 0, absent: 0 }] }); // 11
  }
}

beforeEach(() => {
  // resetAllMocks clears both tracking AND the mockResolvedValueOnce queue.
  // clearAllMocks only clears tracking — leftover Once values would leak between tests.
  jest.resetAllMocks();
  mockQuery.mockResolvedValue({ rows: [] });
});

// ── A. Basic live data: single assessment ─────────────────────────────────────

describe('A. Published live subject with one CA assessment → correct ca/exam/total/grade', () => {
  it('computes ca_score, exam_score, total, grade correctly', async () => {
    // caScore = (80/100) * 30 = 24
    // examScore = (60/100) * 70 = 42
    // total = 66  →  grade B3 (65–69)
    setupMocks({
      caRows:   [{ subject: 'Math', mode_id: MODE_ID, max_score: '100', score: '80' }],
      examRows: [{ subject: 'Math', score: '60', max_score: '100' }],
      publishedSubjects: ['Math'],
    });

    const res = await request(buildApp())
      .get('/api/student/results')
      .query({ academic_year_id: AY_ID, semester: '1' });

    expect(res.status).toBe(200);
    const math = res.body.subjects.find(s => s.subject === 'Math');
    expect(math).toBeDefined();
    expect(math.ca_score).toBeCloseTo(24, 1);
    expect(math.exam_score).toBeCloseTo(42, 1);
    expect(math.total).toBe(66);
    expect(math.grade).toBe('B3');
    expect(math.remark).toMatch(/good/i);
    expect(math.is_imported).toBe(false);
  });
});

// ── B. String-concatenation bug: multiple assessments per subject ──────────────

describe('B. Multiple CA assessments per subject — no string-concat bug on caMaxRaw', () => {
  it('caMaxRaw accumulates numerically, not as string concatenation', async () => {
    // Two assessments for the same mode:
    //   80/100 * 30 = 24  and  60/100 * 30 = 18  →  caRaw = 42, caMaxRaw = 60
    // caScore = (42/60) * 30 = 21
    // examScore = (70/100) * 70 = 49
    // total = 70  →  grade B2 (70–74)
    //
    // The bug: ca_contribution='30' (string from pg).
    //   Without parseFloat: 0 + '30' = '030', then '030' + '30' = '03030'
    //   caScore would then be 42 / 3030 * 30 ≈ 0.4  (WRONG)
    setupMocks({
      caRows: [
        { subject: 'Math', mode_id: MODE_ID, max_score: '100', score: '80' },
        { subject: 'Math', mode_id: MODE_ID, max_score: '100', score: '60' },
      ],
      examRows: [{ subject: 'Math', score: '70', max_score: '100' }],
      publishedSubjects: ['Math'],
    });

    const res = await request(buildApp())
      .get('/api/student/results')
      .query({ academic_year_id: AY_ID, semester: '1' });

    expect(res.status).toBe(200);
    const math = res.body.subjects.find(s => s.subject === 'Math');
    expect(math).toBeDefined();
    expect(math.ca_score).toBeCloseTo(21, 1);    // NOT ≈ 0.4
    expect(math.exam_score).toBeCloseTo(49, 1);
    expect(math.total).toBe(70);
    expect(math.grade).toBe('B2');
  });
});

// ── C. Unpublished subject → hidden ──────────────────────────────────────────

describe('C. Live subject NOT in published set → does not appear', () => {
  it('hides Science when not published', async () => {
    setupMocks({
      caRows:   [{ subject: 'Science', mode_id: MODE_ID, max_score: '100', score: '75' }],
      examRows: [{ subject: 'Science', score: '65', max_score: '100' }],
      publishedSubjects: [],
      expectAverage: false,
    });

    const res = await request(buildApp())
      .get('/api/student/results')
      .query({ academic_year_id: AY_ID, semester: '1' });

    expect(res.status).toBe(200);
    expect(res.body.subjects.find(s => s.subject === 'Science')).toBeUndefined();
    expect(res.body.average).toBeNull();
  });

  it('shows only Math when Math published and Science not', async () => {
    setupMocks({
      caRows: [
        { subject: 'Math',    mode_id: MODE_ID, max_score: '100', score: '80' },
        { subject: 'Science', mode_id: MODE_ID, max_score: '100', score: '75' },
      ],
      examRows: [
        { subject: 'Math',    score: '60', max_score: '100' },
        { subject: 'Science', score: '65', max_score: '100' },
      ],
      publishedSubjects: ['Math'],
    });

    const res = await request(buildApp())
      .get('/api/student/results')
      .query({ academic_year_id: AY_ID, semester: '1' });

    expect(res.status).toBe(200);
    expect(res.body.subjects).toHaveLength(1);
    expect(res.body.subjects[0].subject).toBe('Math');
  });
});

// ── D. Import-only subject always shows ──────────────────────────────────────

describe('D. Admin-imported results always show regardless of published set', () => {
  it('shows imported English when publishedSubjects is empty', async () => {
    setupMocks({
      importRows: [{ subject: 'English', ca_score: '25', exam_score: '48', total_score: '73' }],
      publishedSubjects: [],
      expectAverage: true,  // total=73 from import → average=73 → classmates called
    });

    const res = await request(buildApp())
      .get('/api/student/results')
      .query({ academic_year_id: AY_ID, semester: '1' });

    expect(res.status).toBe(200);
    const eng = res.body.subjects.find(s => s.subject === 'English');
    expect(eng).toBeDefined();
    expect(eng.is_imported).toBe(true);
    expect(eng.total).toBe(73);
  });
});

// ── E. Live published data wins over import ───────────────────────────────────

describe('E. Live published data takes priority over import for the same subject', () => {
  it('uses computed live result, not imported stale data', async () => {
    setupMocks({
      caRows:     [{ subject: 'Math', mode_id: MODE_ID, max_score: '100', score: '80' }],
      examRows:   [{ subject: 'Math', score: '60', max_score: '100' }],
      importRows: [{ subject: 'Math', ca_score: '10', exam_score: '20', total_score: '30' }],
      publishedSubjects: ['Math'],
    });

    const res = await request(buildApp())
      .get('/api/student/results')
      .query({ academic_year_id: AY_ID, semester: '1' });

    expect(res.status).toBe(200);
    const math = res.body.subjects.find(s => s.subject === 'Math');
    expect(math).toBeDefined();
    expect(math.is_imported).toBe(false);
    expect(math.total).toBe(66);   // 24 + 42, NOT imported 30
  });
});

// ── F. No published submissions → empty ───────────────────────────────────────

describe('F. No published submissions → empty subjects list', () => {
  it('returns no subjects when nothing is published', async () => {
    setupMocks({
      caRows:   [{ subject: 'Math', mode_id: MODE_ID, max_score: '100', score: '80' }],
      examRows: [{ subject: 'Math', score: '60', max_score: '100' }],
      publishedSubjects: [],
      expectAverage: false,
    });

    const res = await request(buildApp())
      .get('/api/student/results')
      .query({ academic_year_id: AY_ID, semester: '1' });

    expect(res.status).toBe(200);
    expect(res.body.subjects).toHaveLength(0);
    expect(res.body.average).toBeNull();
  });
});
