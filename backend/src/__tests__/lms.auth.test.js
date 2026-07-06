'use strict';
/**
 * Role access and IDOR tests.
 */

const SCHOOL_ID = 'school-00-0000-0000-0000-000000000000';
const TEACHER_A = 'teacher-aa-0000-0000-0000-000000000000';
const TEACHER_B = 'teacher-bb-0000-0000-0000-000000000000';
const STUDENT_X = 'student-xx-0000-0000-0000-000000000000';

let mockCurrentUser   = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_ID };
let mockCurrentSchool = SCHOOL_ID;

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
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin')
      return res.status(403).json({ error: 'Admin required' });
    next();
  },
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
  mockCurrentUser   = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_ID };
  mockCurrentSchool = SCHOOL_ID;
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── 1. Student cannot call teacher-only endpoints ─────────────────────────────

describe('Role guard — student blocked from teacher endpoints', () => {
  beforeEach(() => {
    mockCurrentUser = { id: STUDENT_X, role: 'student', schoolId: SCHOOL_ID };
  });

  it('POST /courses → 403', async () => {
    const res = await request(buildApp())
      .post('/api/lms/courses')
      .send({ subject_name: 'Maths', class_name: 'SHS 1A' });
    expect(res.status).toBe(403);
  });

  it('DELETE /assignments/:id → 403', async () => {
    const res = await request(buildApp()).delete('/api/lms/assignments/asgn-001');
    expect(res.status).toBe(403);
  });

  it('DELETE /quizzes/:id → 403', async () => {
    const res = await request(buildApp()).delete('/api/lms/quizzes/quiz-001');
    expect(res.status).toBe(403);
  });

  it('PATCH /submissions/:id/grade → 403', async () => {
    const res = await request(buildApp())
      .patch('/api/lms/submissions/sub-001/grade')
      .send({ score: 80 });
    expect(res.status).toBe(403);
  });

  it('DELETE /announcements/:id → 403', async () => {
    const res = await request(buildApp()).delete('/api/lms/announcements/ann-001');
    expect(res.status).toBe(403);
  });
});

// ── 2. Teacher B cannot delete Teacher A's resources ─────────────────────────

describe('IDOR — cross-teacher resource deletion blocked', () => {
  beforeEach(() => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_ID };
  });

  it('DELETE /assignments/:id → 403 when course owned by Teacher A', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ teacher_id: TEACHER_A }] });
    const res = await request(buildApp()).delete('/api/lms/assignments/asgn-001');
    expect(res.status).toBe(403);
  });

  it('DELETE /quizzes/:id → 403 when course owned by Teacher A', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ teacher_id: TEACHER_A }] });
    const res = await request(buildApp()).delete('/api/lms/quizzes/quiz-001');
    expect(res.status).toBe(403);
  });

  it('DELETE /announcements/:id → 403 when course owned by Teacher A', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ teacher_id: TEACHER_A }] });
    const res = await request(buildApp()).delete('/api/lms/announcements/ann-001');
    expect(res.status).toBe(403);
  });

  it('DELETE /lessons/:id → 403 when course owned by Teacher A', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ teacher_id: TEACHER_A }] });
    const res = await request(buildApp()).delete('/api/lms/lessons/lesson-001');
    expect(res.status).toBe(403);
  });

  it('DELETE /assignments/:id → 200 (ok) when Teacher B owns the course', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ teacher_id: TEACHER_B }] })  // ownership check
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });             // DELETE
    const res = await request(buildApp()).delete('/api/lms/assignments/asgn-001');
    expect(res.status).toBe(200);
  });
});

// ── 3. Grade endpoint enforces course ownership ───────────────────────────────

describe('IDOR — grade endpoint ownership check', () => {
  it('→ 403 when grading teacher does not own the course', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_ID };
    mockQuery.mockResolvedValueOnce({ rows: [{ teacher_id: TEACHER_A }] });
    const res = await request(buildApp())
      .patch('/api/lms/submissions/sub-001/grade')
      .send({ score: 75, feedback: 'OK' });
    expect(res.status).toBe(403);
  });

  it('→ 404 when submission does not exist in this school', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp())
      .patch('/api/lms/submissions/sub-ghost/grade')
      .send({ score: 75 });
    expect(res.status).toBe(404);
  });

  it('→ 400 when score field is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ teacher_id: TEACHER_A }] });
    const res = await request(buildApp())
      .patch('/api/lms/submissions/sub-001/grade')
      .send({ feedback: 'No score' });
    expect(res.status).toBe(400);
  });
});

// ── 4. Quiz attempt submit is student-scoped ──────────────────────────────────

describe('Quiz submit — student isolation', () => {
  it('→ 404 when attempt belongs to a different student', async () => {
    mockCurrentUser = { id: STUDENT_X, role: 'student', schoolId: SCHOOL_ID };
    // Query returns empty because student_id filter excludes this attempt
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp())
      .post('/api/lms/attempts/attempt-other/submit')
      .send({ answers: [] });
    expect(res.status).toBe(404);
  });
});

// ── 5. Admin-only endpoint ────────────────────────────────────────────────────

describe('Role guard — admin-only endpoint', () => {
  it('GET /admin/courses → 403 for teacher', async () => {
    mockCurrentUser = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_ID };
    const res = await request(buildApp()).get('/api/lms/admin/courses');
    expect(res.status).toBe(403);
  });

  it('GET /admin/courses → 200 for admin', async () => {
    mockCurrentUser = { id: 'admin-x', role: 'admin', schoolId: SCHOOL_ID };
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/lms/admin/courses');
    expect(res.status).toBe(200);
  });
});
