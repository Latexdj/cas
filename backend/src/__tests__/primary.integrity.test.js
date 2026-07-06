'use strict';
/**
 * Data integrity tests for the primary portal.
 * - attendance student_id validation
 * - assessment max_instances enforcement
 * - excuse 404 on not-found delete
 * - report submit idempotency (409 on already-submitted)
 */

const SCHOOL_ID  = 'school-00-0000-0000-0000-000000000000';
const TEACHER_A  = 'teacher-aa-0000-0000-0000-000000000000';
const STUDENT_A  = 'student-aa-0000-0000-0000-000000000000';
const STUDENT_B  = 'student-bb-0000-0000-0000-000000000000'; // belongs to different class

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

// ── 1. Attendance: student_id filter strips cross-class students ──────────────

describe('Attendance integrity — student_id filtered to teacher\'s class', () => {
  it('strips student IDs not in the teacher\'s class before inserting', async () => {
    // STUDENT_A is in Basic 1 (teacher's class); STUDENT_B is not
    mockQuery
      .mockResolvedValueOnce({ rows: [{ class_name: 'Basic 1' }] })          // class teacher lookup
      .mockResolvedValueOnce({ rows: [{ id: STUDENT_A }] });                  // only STUDENT_A is valid

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // INSERT for STUDENT_A
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(buildApp())
      .post('/api/primary/attendance')
      .send({
        date: '2026-01-15',
        records: [
          { student_id: STUDENT_A, status: 'present' },
          { student_id: STUDENT_B, status: 'present' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/1 student/i);

    // STUDENT_B should never appear in any INSERT call
    const allInsertParams = mockClientQuery.mock.calls
      .filter(c => String(c[0]).includes('INSERT INTO primary_daily_attendance'))
      .flatMap(c => c[1]);
    expect(allInsertParams).not.toContain(STUDENT_B);
    expect(allInsertParams).toContain(STUDENT_A);
  });

  it('→ 403 when teacher has no class assigned', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no class teacher assignment
    const res = await request(buildApp())
      .post('/api/primary/attendance')
      .send({ date: '2026-01-15', records: [{ student_id: STUDENT_A }] });
    expect(res.status).toBe(403);
  });
});

// ── 2. Assessment max_instances enforced ──────────────────────────────────────

describe('Assessment max_instances constraint', () => {
  const MODE_ID    = 'mode-0000-0000-0000-000000000000000';
  const SUBJECT_ID = 'subj-0000-0000-0000-000000000000000';
  const TERM_ID    = 'term-0000-0000-0000-000000000000000';

  it('→ 409 when max_instances already reached', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: MODE_ID, name: 'Quiz', max_instances: 2, ca_weight: 10, is_terminal_exam: false }] }) // mode
      .mockResolvedValueOnce({ rows: [{ class_name: 'Basic 1' }] }); // subject

    // Transaction mocks: BEGIN, SELECT COUNT with FOR UPDATE (returns 2 = limit reached), ROLLBACK
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })              // BEGIN
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // FOR UPDATE count
      .mockResolvedValueOnce({ rows: [] });              // ROLLBACK

    const res = await request(buildApp())
      .post('/api/primary/assessments')
      .send({ term_id: TERM_ID, subject_id: SUBJECT_ID, title: 'Quiz 3', mode_id: MODE_ID, max_score: 10 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/maximum/i);
  });

  it('→ 201 when under max_instances limit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: MODE_ID, name: 'Quiz', max_instances: 3, ca_weight: 10, is_terminal_exam: false }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'Basic 1' }] });

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // FOR UPDATE count (1 of 3)
      .mockResolvedValueOnce({ rows: [{ id: 'new-id', teacher_id: TEACHER_A, term_id: TERM_ID, subject_id: SUBJECT_ID, class_name: 'Basic 1', title: 'Quiz 2', mode_id: MODE_ID, max_score: 10 }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] });              // COMMIT

    const res = await request(buildApp())
      .post('/api/primary/assessments')
      .send({ term_id: TERM_ID, subject_id: SUBJECT_ID, title: 'Quiz 2', mode_id: MODE_ID, max_score: 10 });

    expect(res.status).toBe(201);
  });
});

// ── 3. Delete excuse: 404 when not found ──────────────────────────────────────

describe('DELETE /excuses/:id returns 404 when nothing deleted', () => {
  it('→ 404 when teacher tries to delete a non-pending or non-own excuse', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // DELETE matched nothing
    const res = await request(buildApp()).delete('/api/primary/excuses/ghost-excuse-id');
    expect(res.status).toBe(404);
  });
});

// ── 4. Report submit: 409 when already submitted ─────────────────────────────

describe('PUT /reports/:id/submit idempotency', () => {
  it('→ 409 when remark is already in submitted/approved state', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ class_teacher_id: TEACHER_A }] }) // ownership ok
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                   // UPDATE returns nothing (wrong state)
    const res = await request(buildApp()).put('/api/primary/reports/remark-1/submit');
    expect(res.status).toBe(409);
  });
});

// ── 5. Delete assessment-mode: 404 when not found ─────────────────────────────

describe('DELETE /assessment-modes/:id returns 404', () => {
  it('→ 404 for admin when mode not found', async () => {
    mockCurrentUser = { id: 'admin-x', role: 'admin', schoolId: SCHOOL_ID };
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(buildApp()).delete('/api/primary/assessment-modes/ghost-mode');
    expect(res.status).toBe(404);
  });
});
