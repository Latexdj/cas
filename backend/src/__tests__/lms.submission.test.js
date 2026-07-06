'use strict';
/**
 * Submission integrity tests.
 */

const SCHOOL_ID  = 'school-00-0000-0000-0000-000000000000';
const STUDENT_ID = 'student-xx-0000-0000-0000-000000000000';
const ASGN_ID    = 'asgn-0000-0000-0000-000000000000000';
const QUIZ_ID    = 'quiz-0000-0000-0000-000000000000000';

let mockCurrentUser   = { id: STUDENT_ID, role: 'student', schoolId: SCHOOL_ID };
let mockCurrentSchool = SCHOOL_ID;

const mockQuery       = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease     = jest.fn();
jest.mock('../config/db', () => ({
  query: mockQuery,
  connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: mockRelease }),
}));
jest.mock('../middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.user     = mockCurrentUser;
    req.schoolId = mockCurrentSchool;
    next();
  },
  requireActiveSubscription: (_req, _res, next) => next(),
  adminOnly: (_req, res) => res.status(403).json({ error: 'Admin required' }),
}));
jest.mock('../services/storage.service', () => ({
  uploadFile: jest.fn().mockResolvedValue('https://example.com/file'),
}));

const request   = require('supertest');
const express   = require('express');
const lmsRouter = require('../routes/lms');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/lms', lmsRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser   = { id: STUDENT_ID, role: 'student', schoolId: SCHOOL_ID };
  mockCurrentSchool = SCHOOL_ID;
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── 1. Re-submission clears the grade ─────────────────────────────────────────

describe('Duplicate submission — grade is cleared on re-submit', () => {
  it('upsert SQL resets score, feedback, graded_at to NULL', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: ASGN_ID, is_published: true, class_name: 'SHS 1A', allow_late: true, due_date: null }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'SHS 1A' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', assignment_id: ASGN_ID, student_id: STUDENT_ID }] });

    const res = await request(buildApp())
      .post(`/api/lms/assignments/${ASGN_ID}/submit`)
      .send({ body_text: 'Updated answer' });

    expect(res.status).toBe(201);
    const upsertSQL = mockQuery.mock.calls[2][0];
    expect(upsertSQL).toMatch(/score=NULL/i);
    expect(upsertSQL).toMatch(/feedback=NULL/i);
    expect(upsertSQL).toMatch(/graded_at=NULL/i);
  });
});

// ── 2. Late submission blocked ────────────────────────────────────────────────

describe('Late submission — blocked when allow_late=false', () => {
  it('returns 400 when deadline has passed', async () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: ASGN_ID, is_published: true, class_name: 'SHS 1A', allow_late: false, due_date: pastDate }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'SHS 1A' }] });

    const res = await request(buildApp())
      .post(`/api/lms/assignments/${ASGN_ID}/submit`)
      .send({ body_text: 'Too late' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/late/i);
  });
});

// ── 3. Late submission allowed ────────────────────────────────────────────────

describe('Late submission — allowed when allow_late=true', () => {
  it('returns 201 even after deadline', async () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: ASGN_ID, is_published: true, class_name: 'SHS 1A', allow_late: true, due_date: pastDate }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'SHS 1A' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', is_late: true }] });

    const res = await request(buildApp())
      .post(`/api/lms/assignments/${ASGN_ID}/submit`)
      .send({ body_text: 'Late but allowed' });

    expect(res.status).toBe(201);
  });
});

// ── 4. Quiz max_attempts enforced (via transaction) ───────────────────────────

describe('Quiz attempts — max_attempts limit', () => {
  it('returns 400 when all attempts are used', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: QUIZ_ID, is_published: true, class_name: 'SHS 1A', max_attempts: 1 }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'SHS 1A' }] });
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })            // BEGIN
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] }); // SELECT COUNT (used=1, max=1) → blocked

    const res = await request(buildApp())
      .post(`/api/lms/quizzes/${QUIZ_ID}/attempt`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maximum/i);
  });

  it('returns 201 when attempts remain', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: QUIZ_ID, is_published: true, class_name: 'SHS 1A', max_attempts: 3 }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'SHS 1A' }] })
      .mockResolvedValueOnce({ rows: [] }); // questions fetch

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                              // BEGIN
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })                   // COUNT (1 of 3)
      .mockResolvedValueOnce({ rows: [] })                              // DELETE abandoned
      .mockResolvedValueOnce({ rows: [{ max_score: '10' }] })           // SUM marks
      .mockResolvedValueOnce({ rows: [{ id: 'att-1', quiz_id: QUIZ_ID, student_id: STUDENT_ID, max_score: 10 }] })
      .mockResolvedValueOnce({ rows: [] });                             // COMMIT

    const res = await request(buildApp())
      .post(`/api/lms/quizzes/${QUIZ_ID}/attempt`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('attempt');
    expect(res.body).toHaveProperty('questions');
  });
});

// ── 5. Non-enrolled student blocked ──────────────────────────────────────────

describe('Enrollment check', () => {
  it('returns 403 when student class does not match course class', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: ASGN_ID, is_published: true, class_name: 'SHS 1A', allow_late: true, due_date: null }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'SHS 2B' }] }); // wrong class

    const res = await request(buildApp())
      .post(`/api/lms/assignments/${ASGN_ID}/submit`)
      .send({ body_text: 'Not enrolled' });

    expect(res.status).toBe(403);
  });
});
