'use strict';
/**
 * Security and integrity tests for the SHS assessment module.
 * Covers: tenant isolation, teacher ownership IDOR, max_instances race-condition fix,
 * subject-remarks assignment check, superadmin isAdmin fix, modes role guards.
 */

const SCHOOL_A  = 'aaaaaaaa-0000-0000-0000-000000000000';
const SCHOOL_B  = 'bbbbbbbb-0000-0000-0000-000000000000';
const TEACHER_A = 'teacher-aa-0000-0000-0000-000000000000';
const TEACHER_B = 'teacher-bb-0000-0000-0000-000000000000';
const ASMT_ID   = 'asmt-0000-aaaa-0000-000000000000000';

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

const request     = require('supertest');
const express     = require('express');
const asmtRouter  = require('../routes/assessments');
const modesRouter = require('../routes/assessment-modes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/assessments', asmtRouter);
  app.use('/api/assessment-modes', modesRouter);
  return app;
}

const mockAssessmentA = {
  id: ASMT_ID,
  teacher_id: TEACHER_A,
  school_id: SCHOOL_A,
  academic_year_id: 'ay-0001',
  semester: 1,
  subject: 'Math',
  class_name: '1A',
  max_score: 100,
  mode_id: 'mode-1',
  title: 'Quiz 1',
  date: null,
  created_at: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser   = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_A };
  mockCurrentSchool = SCHOOL_A;
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── 1. Tenant isolation ───────────────────────────────────────────────────────

describe('Tenant isolation — GET /assessments', () => {
  it('filters assessments by authenticated school_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(buildApp())
      .get('/api/assessments')
      .query({ academic_year_id: 'ay-0001', semester: '1', subject: 'Math', class_name: '1A' });
    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe(SCHOOL_A);
    expect(params[0]).not.toBe(SCHOOL_B);
  });
});

describe('Tenant isolation — GET /assessment-modes', () => {
  it('filters modes by school_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/api/assessment-modes');
    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe(SCHOOL_A);
  });
});

describe('Tenant isolation — POST /assessments INSERT', () => {
  it('writes school_id into the INSERT', async () => {
    const MODE_ID = 'mode-0000-0000-0000-000000000001';
    mockQuery.mockResolvedValueOnce({ rows: [{ id: MODE_ID, name: 'Quiz', max_instances: null }] });
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: ASMT_ID }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(buildApp())
      .post('/api/assessments')
      .send({ academic_year_id: 'ay-0001', semester: 1, subject: 'Math', class_name: '1A', mode_id: MODE_ID });

    const insertCall = mockClientQuery.mock.calls.find(c => String(c[0]).includes('INSERT INTO assessments'));
    expect(insertCall).toBeDefined();
    expect(insertCall[1]).toContain(SCHOOL_A);
    expect(insertCall[1]).not.toContain(SCHOOL_B);
  });
});

// ── 2. max_instances race-condition fix ───────────────────────────────────────

describe('POST /assessments — atomic max_instances (FOR UPDATE)', () => {
  const MODE_ID = 'mode-0000-0000-0000-000000000002';

  it('→ 409 when limit is reached; uses a transaction with FOR UPDATE', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: MODE_ID, name: 'Essay', max_instances: 2 }] });
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // FOR UPDATE count
      .mockResolvedValueOnce({ rows: [] });               // ROLLBACK

    const res = await request(buildApp())
      .post('/api/assessments')
      .send({ academic_year_id: 'ay-0001', semester: 1, subject: 'Math', class_name: '1A', mode_id: MODE_ID });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/maximum/i);

    const countCall = mockClientQuery.mock.calls.find(c => String(c[0]).includes('FOR UPDATE'));
    expect(countCall).toBeDefined();
  });

  it('→ 201 when under limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: MODE_ID, name: 'Essay', max_instances: 3 }] });
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // FOR UPDATE count
      .mockResolvedValueOnce({ rows: [{ id: ASMT_ID }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] });               // COMMIT

    const res = await request(buildApp())
      .post('/api/assessments')
      .send({ academic_year_id: 'ay-0001', semester: 1, subject: 'Math', class_name: '1A', mode_id: MODE_ID });

    expect(res.status).toBe(201);
  });
});

// ── 3. IDOR — GET /:id/scores ─────────────────────────────────────────────────

describe('IDOR — GET /:id/scores read access', () => {
  it('→ 403 when Teacher B reads Teacher A assessment scores', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_A };
    mockQuery.mockResolvedValueOnce({ rows: [mockAssessmentA] });
    const res = await request(buildApp()).get(`/api/assessments/${ASMT_ID}/scores`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owner/i);
  });

  it('→ 200 when Teacher A reads own assessment scores', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [mockAssessmentA] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get(`/api/assessments/${ASMT_ID}/scores`);
    expect(res.status).toBe(200);
  });

  it('→ 200 when admin reads any assessment scores', async () => {
    mockCurrentUser = { id: 'admin-x', role: 'admin', schoolId: SCHOOL_A };
    mockQuery
      .mockResolvedValueOnce({ rows: [mockAssessmentA] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get(`/api/assessments/${ASMT_ID}/scores`);
    expect(res.status).toBe(200);
  });
});

// ── 4. IDOR — POST /:id/scores ────────────────────────────────────────────────

describe('IDOR — POST /:id/scores write access', () => {
  it('→ 403 when Teacher B enters scores for Teacher A assessment', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_A };
    mockQuery
      .mockResolvedValueOnce({ rows: [mockAssessmentA] }) // assessment
      .mockResolvedValueOnce({ rows: [] });                // result_submissions → draft
    const res = await request(buildApp())
      .post(`/api/assessments/${ASMT_ID}/scores`)
      .send({ scores: [] });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owner/i);
  });

  it('→ 200 when Teacher A enters scores for own assessment', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [mockAssessmentA] })
      .mockResolvedValueOnce({ rows: [] });
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp())
      .post(`/api/assessments/${ASMT_ID}/scores`)
      .send({ scores: [] });
    expect(res.status).toBe(200);
  });
});

// ── 5. IDOR — GET /:id/score-template ────────────────────────────────────────

describe('IDOR — GET /:id/score-template download', () => {
  it('→ 403 when Teacher B downloads Teacher A score template', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_A };
    mockQuery.mockResolvedValueOnce({ rows: [{ ...mockAssessmentA, mode_name: 'Quiz' }] });
    const res = await request(buildApp()).get(`/api/assessments/${ASMT_ID}/score-template`);
    expect(res.status).toBe(403);
  });
});

// ── 6. IDOR — POST /:id/upload-scores ────────────────────────────────────────

describe('IDOR — POST /:id/upload-scores', () => {
  it('→ 403 when Teacher B uploads scores to Teacher A assessment', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_A };
    mockQuery.mockResolvedValueOnce({ rows: [mockAssessmentA] });
    const res = await request(buildApp())
      .post(`/api/assessments/${ASMT_ID}/upload-scores`)
      .attach('file', Buffer.from('dummy'), { filename: 'scores.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(res.status).toBe(403);
  });
});

// ── 7. IDOR — POST /subject-remarks ──────────────────────────────────────────

describe('IDOR — POST /subject-remarks assignment check', () => {
  it('→ 403 when teacher is not in the timetable for this subject/class', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // timetable → not assigned
    const res = await request(buildApp())
      .post('/api/assessments/subject-remarks')
      .send({
        academic_year_id: 'ay-0001',
        semester: 1,
        subject: 'Math',
        class_name: '1A',
        remarks: [{ student_id: 'stu-1', remarks: 'Good' }],
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not assigned/i);
  });

  it('strips student IDs not in the class before saving', async () => {
    const STUDENT_A = 'student-aa-0000-0000-0000-aaaaaaaaaa00';
    const STUDENT_B = 'student-bb-0000-0000-0000-bbbbbbbbbb00';

    mockQuery
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] })          // timetable → assigned
      .mockResolvedValueOnce({ rows: [{ id: STUDENT_A }] }); // roster — only STUDENT_A valid

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(buildApp())
      .post('/api/assessments/subject-remarks')
      .send({
        academic_year_id: 'ay-0001',
        semester: 1,
        subject: 'Math',
        class_name: '1A',
        remarks: [
          { student_id: STUDENT_A, remarks: 'Excellent' },
          { student_id: STUDENT_B, remarks: 'Injected remark' },
        ],
      });

    expect(res.status).toBe(200);
    const allInsertParams = mockClientQuery.mock.calls
      .filter(c => String(c[0]).includes('INSERT INTO subject_remarks'))
      .flatMap(c => c[1]);
    expect(allInsertParams).toContain(STUDENT_A);
    expect(allInsertParams).not.toContain(STUDENT_B);
  });
});

// ── 8. IDOR — GET /subject-remarks ───────────────────────────────────────────

describe('IDOR — GET /subject-remarks access control', () => {
  it('→ 403 when teacher is not assigned to this subject/class', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // timetable → not assigned
    const res = await request(buildApp())
      .get('/api/assessments/subject-remarks')
      .query({ academic_year_id: 'ay-0001', semester: '1', subject: 'Math', class_name: '1A' });
    expect(res.status).toBe(403);
  });

  it('→ 200 when teacher is assigned', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] }) // timetable → assigned
      .mockResolvedValueOnce({ rows: [] });          // student+remarks query
    const res = await request(buildApp())
      .get('/api/assessments/subject-remarks')
      .query({ academic_year_id: 'ay-0001', semester: '1', subject: 'Math', class_name: '1A' });
    expect(res.status).toBe(200);
  });
});

// ── 9. superadmin isAdmin fix ─────────────────────────────────────────────────

describe('superadmin is treated as admin (isAdmin fix)', () => {
  it('GET / — superadmin sees all assessments (no teacher_id filter in WHERE)', async () => {
    mockCurrentUser = { id: 'sa-1', role: 'superadmin', schoolId: SCHOOL_A };
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(buildApp())
      .get('/api/assessments')
      .query({ academic_year_id: 'ay-0001', semester: '1', subject: 'Math', class_name: '1A' });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).not.toMatch(/AND a\.teacher_id = \$/);
  });
});

// ── 10. assessment-modes admin guards ────────────────────────────────────────

describe('assessment-modes role guards', () => {
  it('POST /assessment-modes → 403 for teacher', async () => {
    const res = await request(buildApp())
      .post('/api/assessment-modes')
      .send({ name: 'Hack' });
    expect(res.status).toBe(403);
  });

  it('PUT /assessment-modes/:id → 403 for teacher', async () => {
    const res = await request(buildApp())
      .put('/api/assessment-modes/mode-1')
      .send({ name: 'Hack' });
    expect(res.status).toBe(403);
  });

  it('DELETE /assessment-modes/:id → 404 when mode not found', async () => {
    mockCurrentUser = { id: 'admin-x', role: 'admin', schoolId: SCHOOL_A };
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(buildApp()).delete('/api/assessment-modes/ghost-id');
    expect(res.status).toBe(404);
  });
});
