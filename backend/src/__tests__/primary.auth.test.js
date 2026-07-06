'use strict';
/**
 * Role access and IDOR tests for the primary portal.
 */

const SCHOOL_ID  = 'school-00-0000-0000-0000-000000000000';
const TEACHER_A  = 'teacher-aa-0000-0000-0000-000000000000';
const TEACHER_B  = 'teacher-bb-0000-0000-0000-000000000000';

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
  mockCurrentUser   = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_ID };
  mockCurrentSchool = SCHOOL_ID;
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── 1. Admin-only endpoints reject teachers ───────────────────────────────────

describe('Role guard — teacher blocked from admin endpoints', () => {
  it('POST /terms → 403', async () => {
    const res = await request(buildApp()).post('/api/primary/terms').send({ name: 'T1' });
    expect(res.status).toBe(403);
  });

  it('GET /teacher-attendance → 403', async () => {
    const res = await request(buildApp()).get('/api/primary/teacher-attendance?date=2026-01-15');
    expect(res.status).toBe(403);
  });

  it('POST /teacher-attendance → 403', async () => {
    const res = await request(buildApp()).post('/api/primary/teacher-attendance').send({ date: '2026-01-15', records: [] });
    expect(res.status).toBe(403);
  });

  it('DELETE /students/:id → 403', async () => {
    const res = await request(buildApp()).delete('/api/primary/students/some-id');
    expect(res.status).toBe(403);
  });

  it('PUT /reports/:id/approve → 403', async () => {
    const res = await request(buildApp()).put('/api/primary/reports/remark-1/approve').send({});
    expect(res.status).toBe(403);
  });
});

// ── 2. Teacher attendance GET is now admin-only ───────────────────────────────

describe('GET /teacher-attendance access control', () => {
  it('→ 403 for a regular teacher', async () => {
    mockCurrentUser = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_ID };
    const res = await request(buildApp()).get('/api/primary/teacher-attendance?date=2026-01-15');
    expect(res.status).toBe(403);
  });

  it('→ 200 for an admin', async () => {
    mockCurrentUser = { id: 'admin-x', role: 'admin', schoolId: SCHOOL_ID };
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/primary/teacher-attendance?date=2026-01-15');
    expect(res.status).toBe(200);
  });
});

// ── 3. IDOR — attendance class restriction ────────────────────────────────────

describe('IDOR — GET /attendance class restriction', () => {
  it('→ 403 when teacher has no class assigned', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no class assignment
    const res = await request(buildApp()).get('/api/primary/attendance?date=2026-01-15');
    expect(res.status).toBe(403);
  });

  it('→ 200 and uses teacher assigned class (ignores supplied class_name)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ class_name: 'Basic 1' }] })  // class teacher lookup
      .mockResolvedValueOnce({ rows: [] });                            // student attendance list
    const res = await request(buildApp())
      .get('/api/primary/attendance?date=2026-01-15&class_name=Basic 5');
    expect(res.status).toBe(200);
    // Verify the class used in the final student query is Basic 1 (not Basic 5)
    const studentQueryParams = mockQuery.mock.calls[1][1];
    expect(studentQueryParams[1].toLowerCase()).toBe('basic 1');
  });
});

// ── 4. IDOR — report remarks ownership ───────────────────────────────────────

describe('IDOR — POST /reports/remarks ownership', () => {
  it('→ 403 when teacher is not the class teacher for the student', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_ID };
    const STUDENT_ID = 'student-0000-0000-0000-000000000000';
    const TERM_ID    = 'term-0000-0000-0000-000000000000000';

    mockQuery
      .mockResolvedValueOnce({ rows: [{ class_name: 'Basic 3' }] })        // student lookup
      .mockResolvedValueOnce({ rows: [{ academic_year_id: 'ay-1' }] })      // term lookup
      .mockResolvedValueOnce({ rows: [] });                                   // class teacher check → empty → not assigned

    const res = await request(buildApp())
      .post('/api/primary/reports/remarks')
      .send({ student_id: STUDENT_ID, term_id: TERM_ID, class_teacher_remarks: 'Good work' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/class teacher/i);
  });

  it('→ 404 when student does not exist in this school', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // student not found
    const res = await request(buildApp())
      .post('/api/primary/reports/remarks')
      .send({ student_id: 'ghost-id', term_id: 'term-id', class_teacher_remarks: 'x' });
    expect(res.status).toBe(404);
  });
});

// ── 5. IDOR — report submit ownership ────────────────────────────────────────

describe('IDOR — PUT /reports/:id/submit ownership', () => {
  it('→ 403 when submitting teacher is not the class teacher for the remark', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_ID };
    mockQuery.mockResolvedValueOnce({ rows: [{ class_teacher_id: TEACHER_A }] }); // remark owned by A
    const res = await request(buildApp()).put('/api/primary/reports/remark-1/submit');
    expect(res.status).toBe(403);
  });

  it('→ 404 when remark not found in this school', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).put('/api/primary/reports/ghost-remark/submit');
    expect(res.status).toBe(404);
  });

  it('→ 200 when correct teacher submits own remark', async () => {
    mockCurrentUser = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_ID };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ class_teacher_id: TEACHER_A }] })       // ownership check
      .mockResolvedValueOnce({ rows: [{ id: 'remark-1', status: 'submitted' }] }); // UPDATE
    const res = await request(buildApp()).put('/api/primary/reports/remark-1/submit');
    expect(res.status).toBe(200);
  });
});

// ── 6. IDOR — assessment ownership checks ────────────────────────────────────

describe('IDOR — assessment ownership', () => {
  it('PUT /assessments/:id → 403 when Teacher B edits Teacher A assessment', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_ID };
    mockQuery.mockResolvedValueOnce({ rows: [{ teacher_id: TEACHER_A }] });
    const res = await request(buildApp())
      .put('/api/primary/assessments/asgn-1')
      .send({ title: 'Hack' });
    expect(res.status).toBe(403);
  });

  it('DELETE /assessments/:id → 403 when Teacher B deletes Teacher A assessment', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_ID };
    mockQuery.mockResolvedValueOnce({ rows: [{ teacher_id: TEACHER_A }] });
    const res = await request(buildApp()).delete('/api/primary/assessments/asgn-1');
    expect(res.status).toBe(403);
  });

  it('POST /assessments/:id/scores → 403 when Teacher B scores Teacher A assessment', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_ID };
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'asgn-1', teacher_id: TEACHER_A, max_score: 100, class_name: 'Basic 1', mode_id: 'mode-1', term_id: 'term-1', subject_id: 'subj-1' }] });
    const res = await request(buildApp())
      .post('/api/primary/assessments/asgn-1/scores')
      .send({ scores: [] });
    expect(res.status).toBe(403);
  });

  it('DELETE /assessments/:id → 200 when Teacher A deletes own assessment', async () => {
    mockCurrentUser = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_ID };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ teacher_id: TEACHER_A }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(buildApp()).delete('/api/primary/assessments/asgn-1');
    expect(res.status).toBe(200);
  });
});

// ── 7. Scores class authorization ────────────────────────────────────────────

describe('IDOR — POST /scores class authorization', () => {
  it('→ 403 when teacher is not assigned to the subject\'s class', async () => {
    const TERM_ID    = 'term-0000-0000-0000-000000000000000';
    const SUBJECT_ID = 'subj-0000-0000-0000-000000000000000';
    mockQuery
      .mockResolvedValueOnce({ rows: [{ academic_year_id: 'ay-1' }] })  // term
      .mockResolvedValueOnce({ rows: [{ class_name: 'Basic 5' }] })      // subject
      .mockResolvedValueOnce({ rows: [] });                               // teacher class check → not assigned

    const res = await request(buildApp())
      .post('/api/primary/scores')
      .send({ term_id: TERM_ID, subject_id: SUBJECT_ID, scores: [] });
    expect(res.status).toBe(403);
  });
});
