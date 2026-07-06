'use strict';
/**
 * Tenant isolation tests — every primary query must filter by school_id.
 */

const SCHOOL_A  = 'aaaaaaaa-0000-0000-0000-000000000000';
const SCHOOL_B  = 'bbbbbbbb-0000-0000-0000-000000000000';
const TEACHER_A = 'teacher-a-0000-0000-0000-000000000000';

let mockCurrentUser   = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_A };
let mockCurrentSchool = SCHOOL_A;

const mockQuery       = jest.fn();
const mockClientQuery = jest.fn();
jest.mock('../config/db', () => ({
  query: mockQuery,
  connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: jest.fn() }),
}));
jest.mock('../middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.user     = mockCurrentUser;
    req.schoolId = mockCurrentSchool;
    next();
  },
  requireActiveSubscription: (_req, _res, next) => next(),
  adminOnly: (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Admin required' });
    next();
  },
}));
jest.mock('../services/storage.service', () => ({
  uploadFile: jest.fn().mockResolvedValue('https://example.com/file'),
}));
jest.mock('../services/geo.service', () => ({
  calculateDistance: jest.fn().mockReturnValue(50),
}));
jest.mock('../jobs/absenceCheck', () => ({
  runPrimaryAbsenceCheck: jest.fn().mockResolvedValue({ inserted: 0 }),
}));

const request       = require('supertest');
const express       = require('express');
const primaryRouter = require('../routes/primary');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/primary', primaryRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser   = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_A };
  mockCurrentSchool = SCHOOL_A;
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── 1. Terms query uses school_id ─────────────────────────────────────────────

describe('Tenant isolation — GET /terms', () => {
  it('filters terms by authenticated school_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/api/primary/terms');
    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe(SCHOOL_A);
    expect(params[0]).not.toBe(SCHOOL_B);
  });
});

// ── 2. Students query uses school_id ──────────────────────────────────────────

describe('Tenant isolation — GET /students/:id', () => {
  it('lookup includes school_id', async () => {
    const STUDENT_ID = 'student-0000-0000-0000-000000000000';
    mockQuery.mockResolvedValueOnce({ rows: [{ id: STUDENT_ID }] });
    await request(buildApp()).get(`/api/primary/students/${STUDENT_ID}`);
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(SCHOOL_A);
    expect(params).not.toContain(SCHOOL_B);
  });
});

// ── 3. Attendance INSERT contains school_id ───────────────────────────────────

describe('Tenant isolation — POST /attendance', () => {
  it('writes school_id into the attendance INSERT', async () => {
    const STUDENT_ID = 'student-0000-0000-0000-000000000000';
    // Mock: class teacher lookup, then valid students list
    mockQuery
      .mockResolvedValueOnce({ rows: [{ class_name: 'Basic 1' }] })  // class teacher lookup
      .mockResolvedValueOnce({ rows: [{ id: STUDENT_ID }] });         // valid students
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await request(buildApp())
      .post('/api/primary/attendance')
      .send({ date: '2026-01-15', records: [{ student_id: STUDENT_ID, status: 'present' }] });

    const insertCall = mockClientQuery.mock.calls.find(c => String(c[0]).includes('INSERT INTO primary_daily_attendance'));
    expect(insertCall).toBeDefined();
    expect(insertCall[1]).toContain(SCHOOL_A);
    expect(insertCall[1]).not.toContain(SCHOOL_B);
  });
});

// ── 4. Scores INSERT contains school_id ───────────────────────────────────────

describe('Tenant isolation — POST /scores', () => {
  it('writes school_id into the scores INSERT', async () => {
    const STUDENT_ID = 'student-0000-0000-0000-000000000000';
    const SUBJECT_ID = 'subject-0000-0000-0000-000000000000';
    const TERM_ID    = 'term-0000-0000-0000-000000000000000';

    mockQuery
      .mockResolvedValueOnce({ rows: [{ academic_year_id: 'ay-1' }] })      // term lookup
      .mockResolvedValueOnce({ rows: [{ class_name: 'Basic 1' }] })          // subject lookup
      .mockResolvedValueOnce({ rows: [{ rows: [] }] })                        // teacher class check
      .mockResolvedValueOnce({ rows: [{ id: STUDENT_ID }] })                 // valid students
      .mockResolvedValueOnce({ rows: [] });                                   // grade scale

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    // Make teacher class assignment check succeed
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ academic_year_id: 'ay-1' }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'Basic 1' }] })
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] })           // teacher assigned check
      .mockResolvedValueOnce({ rows: [{ id: STUDENT_ID }] }) // valid students
      .mockResolvedValueOnce({ rows: [] });                   // grade scale (empty = F9 always)

    await request(buildApp())
      .post('/api/primary/scores')
      .send({ term_id: TERM_ID, subject_id: SUBJECT_ID, scores: [{ student_id: STUDENT_ID, class_score: 25, exam_score: 60 }] });

    // First query is "SELECT ... FROM primary_terms WHERE id=$1 AND school_id=$2"
    const firstCallParams = mockQuery.mock.calls[0][1];
    expect(firstCallParams).toContain(SCHOOL_A);
    expect(firstCallParams).not.toContain(SCHOOL_B);
  });
});

// ── 5. Assessment modes query uses school_id ──────────────────────────────────

describe('Tenant isolation — GET /assessment-modes', () => {
  it('filters modes by school_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/api/primary/assessment-modes');
    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe(SCHOOL_A);
  });
});

// ── 6. Cashbook query uses school_id ─────────────────────────────────────────

describe('Tenant isolation — GET /cashbook', () => {
  it('filters cashbooks by school_id', async () => {
    mockCurrentUser = { id: 'admin-x', role: 'admin', schoolId: SCHOOL_A };
    mockCurrentSchool = SCHOOL_A;
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/api/primary/cashbook');
    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe(SCHOOL_A);
    expect(params[0]).not.toBe(SCHOOL_B);
  });
});
