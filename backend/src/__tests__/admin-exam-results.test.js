'use strict';
/**
 * admin-exam-results.js — WAEC Results Analysis routes. Covers the
 * parse-from-paste path, the save transaction, tenant isolation, the role
 * guard, and the report endpoint's "no grade_boundaries configured" guard.
 * PDF/Excel export rendering itself isn't exercised here (would need a
 * real Chrome/puppeteer in CI) — the report-computation inputs they share
 * with /report are covered by examResultsReport.test.js.
 */

const SCHOOL_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const ADMIN_A  = 'admin-a-0000-0000-0000-000000000000';

let mockCurrentUser   = { id: ADMIN_A, role: 'admin', schoolId: SCHOOL_A };
let mockCurrentSchool = SCHOOL_A;

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
jest.mock('../config/db', () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn().mockResolvedValue({ query: (...args) => mockClientQuery(...args), release: (...args) => mockRelease(...args) }),
}));
jest.mock('../middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = mockCurrentUser; req.schoolId = mockCurrentSchool; next(); },
  requireActiveSubscription: (_req, _res, next) => next(),
  adminOnly: (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  },
}));
jest.mock('../middleware/moduleAccess', () => ({
  checkModuleAccess: () => (_req, _res, next) => next(),
}));

const request = require('supertest');
const express = require('express');
const examResultsRouter = require('../routes/admin-exam-results');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/exam-results', examResultsRouter);
  return app;
}

const SIMPLE_LISTING = `
INDEX NUMBERNAMEGENDERDOBRESULTS
0100505001
TEST CANDIDATE
Female01/01/2005
MATHEMATICS(CORE) - C6 ,
ENGLISH LANG - F9
Total Number of Candidates: 1
`;

beforeEach(() => {
  mockQuery.mockReset();
  mockClientQuery.mockReset();
  mockRelease.mockReset();
  mockCurrentUser = { id: ADMIN_A, role: 'admin', schoolId: SCHOOL_A };
  mockCurrentSchool = SCHOOL_A;
});

describe('Role guard', () => {
  it('a teacher is blocked from every exam-results route (403)', async () => {
    mockCurrentUser = { id: 'teacher-1', role: 'teacher', schoolId: SCHOOL_A };
    const res = await request(buildApp()).get('/api/admin/exam-results/batches');
    expect(res.status).toBe(403);
  });
});

describe('POST /parse — paste path', () => {
  it('parses pasted text and returns candidates without touching the database', async () => {
    const res = await request(buildApp()).post('/api/admin/exam-results/parse').send({ raw_text: SIMPLE_LISTING });
    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.source).toBe('paste');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an empty request with neither a file nor raw_text', async () => {
    const res = await request(buildApp()).post('/api/admin/exam-results/parse').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /batches — save transaction', () => {
  it('rejects an invalid exam_body', async () => {
    const res = await request(buildApp()).post('/api/admin/exam-results/batches').send({
      exam_body: 'NECO', year: 2023, source: 'paste', raw_text: SIMPLE_LISTING,
    });
    expect(res.status).toBe(400);
  });

  it('rejects when raw_text has no parseable candidates', async () => {
    const res = await request(buildApp()).post('/api/admin/exam-results/batches').send({
      exam_body: 'WAEC', year: 2023, source: 'paste', raw_text: 'nothing useful here',
    });
    expect(res.status).toBe(400);
  });

  it('creates a new batch inside a transaction, inserting candidates and grades in bulk', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                                      // BEGIN (no-op in mock, but counted)
      .mockResolvedValueOnce({ rows: [] })                                      // SELECT existing -> none
      .mockResolvedValueOnce({ rows: [{ id: 'batch-1' }] })                     // INSERT batch
      .mockResolvedValueOnce({ rows: [{ id: 'cand-1', index_number: '0100505001' }] }) // bulk INSERT candidates
      .mockResolvedValueOnce({ rows: [] })                                      // bulk INSERT grades
      .mockResolvedValueOnce({ rows: [] });                                     // COMMIT
    const res = await request(buildApp()).post('/api/admin/exam-results/batches').send({
      exam_body: 'WAEC', year: 2023, source: 'paste', raw_text: SIMPLE_LISTING,
    });
    expect(res.status).toBe(201);
    expect(res.body.candidateCount).toBe(1);
    const insertBatchCall = mockClientQuery.mock.calls.find(c => c[0].includes('INSERT INTO exam_result_batches'));
    expect(insertBatchCall[1]).toContain(SCHOOL_A);
    // Exactly one bulk call for candidates (unnest over arrays), not one
    // call per candidate — this is the fix for a real timeout on a real
    // 50-candidate listing's ~450 one-row-at-a-time inserts.
    const candidateInsertCalls = mockClientQuery.mock.calls.filter(c => c[0].includes('INSERT INTO exam_result_candidates'));
    expect(candidateInsertCalls).toHaveLength(1);
    const gradeInsertCalls = mockClientQuery.mock.calls.filter(c => c[0].includes('INSERT INTO exam_result_grades'));
    expect(gradeInsertCalls).toHaveLength(1);
  });

  it('rolls back and surfaces the error if a write fails mid-transaction', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('insert failed'));
    const res = await request(buildApp()).post('/api/admin/exam-results/batches').send({
      exam_body: 'WAEC', year: 2023, source: 'paste', raw_text: SIMPLE_LISTING,
    });
    expect(res.status).toBe(500);
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe('Tenant isolation', () => {
  it('GET /batches/:id scopes the lookup by school_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/admin/exam-results/batches/batch-owned-by-another-school');
    expect(res.status).toBe(404);
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(SCHOOL_A);
  });

  it('DELETE /batches/:id scopes the delete by school_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'batch-1' }] });
    await request(buildApp()).delete('/api/admin/exam-results/batches/batch-1');
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(SCHOOL_A);
  });

  it('DELETE of a non-owned batch 404s', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).delete('/api/admin/exam-results/batches/not-mine');
    expect(res.status).toBe(404);
  });
});

describe('GET /batches/:id/report', () => {
  it('404s for a batch that does not exist or belongs to another school', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/admin/exam-results/batches/unknown/report');
    expect(res.status).toBe(404);
  });

  it('400s with a clear message when no grade_boundaries are configured for this exam_body', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'batch-1', exam_body: 'WAEC', year: 2023, school_number: '0100505', registered_data: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cand-1', index_number: '0100505001', name: 'Test', gender: 'Female', dob: '2005-01-01', grades: [] }] })
      .mockResolvedValueOnce({ rows: [] }); // grade_boundaries empty
    const res = await request(buildApp()).get('/api/admin/exam-results/batches/batch-1/report');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/grade boundaries/i);
  });
});

const BOUNDARIES_ROW = { rows: [
  { grade: 'C6', remark: 'Credit', sort_order: 4 },
  { grade: 'F9', remark: 'Fail', sort_order: 1 },
] };

describe('GET /analytics', () => {
  it('returns an empty-but-well-shaped payload when no batches exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // batch list
    const res = await request(buildApp()).get('/api/admin/exam-results/analytics');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ years: [], subjects: [], totalCandidates: 0, overallPassRate: 0, rows: [], latestBySubject: [] });
  });

  it('aggregates across every saved WASSCE batch and reflects a years filter in the query sent to the DB', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'b2023', year: 2023 }] })  // batch list (years-filtered)
      .mockResolvedValueOnce(BOUNDARIES_ROW)                           // grade_boundaries
      .mockResolvedValueOnce({ rows: [                                  // candidates for b2023
        { id: 'c1', index_number: '1', name: 'A', gender: 'Male', dob: '2005-01-01', grades: [{ subjectName: 'Mathematics', grade: 'C6' }] },
        { id: 'c2', index_number: '2', name: 'B', gender: 'Female', dob: '2005-01-01', grades: [{ subjectName: 'Mathematics', grade: 'F9' }] },
      ] });
    const res = await request(buildApp()).get('/api/admin/exam-results/analytics').query({ years: '2023' });
    expect(res.status).toBe(200);
    expect(res.body.years).toEqual([2023]);
    expect(res.body.totalCandidates).toBe(2);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({ subject: 'Mathematics', year: 2023, performanceLabel: 'Average' });

    const batchListCall = mockQuery.mock.calls[0];
    expect(batchListCall[1]).toEqual(['aaaaaaaa-0000-0000-0000-000000000000', 'WAEC', [2023]]);
  });

  it('400s with a clear message when no grade_boundaries are configured', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'b2023', year: 2023 }] })
      .mockResolvedValueOnce({ rows: [] }); // grade_boundaries empty
    const res = await request(buildApp()).get('/api/admin/exam-results/analytics');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/grade boundaries/i);
  });
});

describe('GET /analytics/export.csv', () => {
  it('returns a CSV with one row per subject-year', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'b2023', year: 2023 }] })
      .mockResolvedValueOnce(BOUNDARIES_ROW)
      .mockResolvedValueOnce({ rows: [
        { id: 'c1', index_number: '1', name: 'A', gender: 'Male', dob: '2005-01-01', grades: [{ subjectName: 'Mathematics', grade: 'C6' }] },
      ] });
    const res = await request(buildApp()).get('/api/admin/exam-results/analytics/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Subject,Year,Candidates,Pass Rate (%),Fail Rate (%),Top Grade,Performance');
    expect(res.text).toContain('Mathematics,2023,1,100,0,C6,Excellent');
  });
});

describe('POST /parse-excel — Excel Analysis Report upload (no listing available for that year)', () => {
  const path = require('path');
  const fixture = path.join(__dirname, 'fixtures', 'analysis-reports', '2021-standard.xlsx');

  it('parses a real old Analysis Report workbook and returns its sheets without touching the database', async () => {
    const res = await request(buildApp()).post('/api/admin/exam-results/parse-excel').attach('file', fixture);
    expect(res.status).toBe(200);
    expect(res.body.sheets).toHaveLength(1);
    expect(res.body.sheets[0].detectedYear).toBe(2021);
    expect(res.body.sheets[0].subjects.length).toBeGreaterThan(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects a request with no file', async () => {
    const res = await request(buildApp()).post('/api/admin/exam-results/parse-excel');
    expect(res.status).toBe(400);
  });

  it('rejects a non-.xlsx file', async () => {
    const res = await request(buildApp())
      .post('/api/admin/exam-results/parse-excel')
      .attach('file', Buffer.from('not an excel file'), { filename: 'listing.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('appends the soft consistency checks to each sheet\'s warnings — this real file genuinely has a few (an old, hand-entered record, not a parser bug)', async () => {
    const res = await request(buildApp()).post('/api/admin/exam-results/parse-excel').attach('file', fixture);
    const softTypes = ['presented_mismatch', 'registered_mismatch', 'core_subject_mismatch', 'total_mismatch', 'no_core_subjects', 'summary_mismatch'];
    const soft = res.body.sheets[0].warnings.filter(w => softTypes.includes(w.type));
    expect(soft.length).toBeGreaterThan(0);
    // The real anomaly this surfaced: Social Studies' grade counts are
    // split 16 boys / 41 girls while Presented says 15 boys / 42 girls —
    // same total (57) either way, which is exactly why a totals-only
    // check would have missed it.
    expect(soft.some(w => w.type === 'presented_mismatch' && w.message.includes('Social Studies') && w.message.includes('Boys') && w.message.includes('Girls'))).toBe(true);
  });
});

describe('POST /batches — source: excel (aggregate, no candidates)', () => {
  const AGGREGATE_REPORT = {
    totalCandidates: 2,
    subjects: [{
      name: 'Mathematics', isCore: true,
      registered: { boys: 1, girls: 1 }, presented: { boys: 1, girls: 1 },
      absent: { boys: 0, girls: 0 }, cancelled: { boys: 0, girls: 0 },
      gradeDistribution: { C6: { boys: 1, girls: 0 }, F9: { boys: 0, girls: 1 } },
    }],
    summaryOfPasses: null,
  };

  it('rejects when aggregate_report has no subjects', async () => {
    const res = await request(buildApp()).post('/api/admin/exam-results/batches').send({
      exam_body: 'WAEC', year: 2021, source: 'excel', aggregate_report: { totalCandidates: 0, subjects: [] },
    });
    expect(res.status).toBe(400);
  });

  it('rejects a hard validation violation (negative number) without touching the database', async () => {
    const broken = { ...AGGREGATE_REPORT, subjects: [{ ...AGGREGATE_REPORT.subjects[0], absent: { boys: -1, girls: 0 } }] };
    const res = await request(buildApp()).post('/api/admin/exam-results/batches').send({
      exam_body: 'WAEC', year: 2021, source: 'excel', aggregate_report: broken,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/negative/i);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('rejects a duplicate subject name', async () => {
    const broken = { ...AGGREGATE_REPORT, subjects: [AGGREGATE_REPORT.subjects[0], AGGREGATE_REPORT.subjects[0]] };
    const res = await request(buildApp()).post('/api/admin/exam-results/batches').send({
      exam_body: 'WAEC', year: 2021, source: 'excel', aggregate_report: broken,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/more than once/i);
  });

  it('accepts a soft-warning-triggering but not hard-blocked report (Presented/grade mismatch is advisory only)', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'batch-excel-2' }] }).mockResolvedValueOnce({ rows: [] });
    const inconsistent = {
      ...AGGREGATE_REPORT,
      subjects: [{ ...AGGREGATE_REPORT.subjects[0], presented: { boys: 5, girls: 5 } }], // doesn't match its own grade counts
    };
    const res = await request(buildApp()).post('/api/admin/exam-results/batches').send({
      exam_body: 'WAEC', year: 2021, source: 'excel', aggregate_report: inconsistent,
    });
    expect(res.status).toBe(201);
  });

  it('saves an excel-sourced batch with zero candidate/grade inserts', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                      // BEGIN
      .mockResolvedValueOnce({ rows: [] })                      // SELECT existing -> none
      .mockResolvedValueOnce({ rows: [{ id: 'batch-excel-1' }] }) // INSERT batch
      .mockResolvedValueOnce({ rows: [] });                     // COMMIT
    const res = await request(buildApp()).post('/api/admin/exam-results/batches').send({
      exam_body: 'WAEC', year: 2021, source: 'excel', aggregate_report: AGGREGATE_REPORT,
    });
    expect(res.status).toBe(201);
    expect(res.body.candidateCount).toBe(0);
    // No INSERT INTO exam_result_candidates/exam_result_grades for this source.
    expect(mockClientQuery.mock.calls.some(c => c[0].includes('INSERT INTO exam_result_candidates'))).toBe(false);
    expect(mockClientQuery.mock.calls.some(c => c[0].includes('INSERT INTO exam_result_grades'))).toBe(false);
    const insertCall = mockClientQuery.mock.calls.find(c => c[0].includes('INSERT INTO exam_result_batches'));
    expect(insertCall[1]).toContain('excel');
  });
});

describe('GET /batches/:id/report — source: excel', () => {
  it('computes the report from the stored aggregate_report, skipping the candidates query entirely', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{
        id: 'batch-excel-1', exam_body: 'WAEC', year: 2021, school_number: null,
        source: 'excel', registered_data: null, official_summary: null,
        aggregate_report: {
          totalCandidates: 2,
          subjects: [{
            name: 'Mathematics', isCore: true,
            registered: { boys: 1, girls: 1 }, presented: { boys: 1, girls: 1 },
            absent: { boys: 0, girls: 0 }, cancelled: { boys: 0, girls: 0 },
            gradeDistribution: { C6: { boys: 1, girls: 0 }, F9: { boys: 0, girls: 1 } },
          }],
          summaryOfPasses: null,
        },
      }] })
      .mockResolvedValueOnce(BOUNDARIES_ROW); // grade_boundaries — the only other query this path makes
    const res = await request(buildApp()).get('/api/admin/exam-results/batches/batch-excel-1/report');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('excel');
    expect(res.body.subjects[0].percentagePass).toEqual({ boys: 100, girls: 0, total: 50 });
    expect(mockQuery).toHaveBeenCalledTimes(2); // batch row + grade_boundaries, no candidates query
  });
});
