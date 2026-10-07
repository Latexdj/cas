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

  it('creates a new batch inside a transaction when none exists for this year', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                           // BEGIN (no-op in mock, but counted)
      .mockResolvedValueOnce({ rows: [] })                           // SELECT existing -> none
      .mockResolvedValueOnce({ rows: [{ id: 'batch-1' }] })          // INSERT batch
      .mockResolvedValueOnce({ rows: [{ id: 'cand-1' }] })           // INSERT candidate
      .mockResolvedValueOnce({ rows: [] })                           // INSERT grade (Mathematics)
      .mockResolvedValueOnce({ rows: [] })                           // INSERT grade (English)
      .mockResolvedValueOnce({ rows: [] });                          // COMMIT
    const res = await request(buildApp()).post('/api/admin/exam-results/batches').send({
      exam_body: 'WAEC', year: 2023, source: 'paste', raw_text: SIMPLE_LISTING,
    });
    expect(res.status).toBe(201);
    expect(res.body.candidateCount).toBe(1);
    const insertBatchCall = mockClientQuery.mock.calls.find(c => c[0].includes('INSERT INTO exam_result_batches'));
    expect(insertBatchCall[1]).toContain(SCHOOL_A);
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
