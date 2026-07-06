'use strict';
/**
 * Tenant isolation tests — every LMS query must filter by school_id so that
 * one school's users cannot read or mutate another school's data.
 */

const SCHOOL_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const SCHOOL_B = 'bbbbbbbb-0000-0000-0000-000000000000';
const TEACHER_A = 'teacher-a-0000-0000-0000-000000000000';

// Variables must be 'mock'-prefixed to be accessible inside jest.mock() factories.
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
  mockCurrentUser   = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_A };
  mockCurrentSchool = SCHOOL_A;
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Tenant isolation — GET /my-courses', () => {
  it('scopes query to the authenticated school (never SCHOOL_B)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/api/lms/my-courses');
    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe(SCHOOL_A);
    expect(params[0]).not.toBe(SCHOOL_B);
  });
});

describe('Tenant isolation — GET /courses/:id', () => {
  it('includes school_id in the course lookup', async () => {
    mockCurrentUser   = { id: 'student-x', role: 'student', schoolId: SCHOOL_A };
    mockCurrentSchool = SCHOOL_A;
    const COURSE_ID   = 'course-00-0000-0000-0000-000000000000';
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: COURSE_ID, status: 'published', class_name: 'SHS 1A' }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'SHS 1A' }] });
    await request(buildApp()).get(`/api/lms/courses/${COURSE_ID}`);
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(SCHOOL_A);
    expect(params).not.toContain(SCHOOL_B);
  });
});

describe('Tenant isolation — admin/courses', () => {
  it('always includes school_id', async () => {
    mockCurrentUser   = { id: 'admin-x', role: 'admin', schoolId: SCHOOL_A };
    mockCurrentSchool = SCHOOL_A;
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/api/lms/admin/courses');
    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe(SCHOOL_A);
  });
});

describe('Tenant isolation — pasco GET', () => {
  it('filters questions by school_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/api/lms/pasco');
    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe(SCHOOL_A);
  });
});

describe('Tenant isolation — student/courses', () => {
  it('scopes course list to student school', async () => {
    mockCurrentUser   = { id: 'student-x', role: 'student', schoolId: SCHOOL_A };
    mockCurrentSchool = SCHOOL_A;
    mockQuery
      .mockResolvedValueOnce({ rows: [{ class_name: 'SHS 1A' }] })
      .mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/api/lms/student/courses');
    const courseParams = mockQuery.mock.calls[1][1];
    expect(courseParams).toContain(SCHOOL_A);
    expect(courseParams).not.toContain(SCHOOL_B);
  });
});

describe('Tenant isolation — assignment submission insert', () => {
  it('writes school_id into the INSERT', async () => {
    mockCurrentUser   = { id: 'student-x', role: 'student', schoolId: SCHOOL_A };
    mockCurrentSchool = SCHOOL_A;
    const ASGN_ID = 'asgn-0000-0000-0000-000000000000';
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: ASGN_ID, is_published: true, class_name: 'SHS 1A', allow_late: true, due_date: null }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'SHS 1A' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', assignment_id: ASGN_ID, student_id: 'student-x' }] });
    await request(buildApp())
      .post(`/api/lms/assignments/${ASGN_ID}/submit`)
      .send({ body_text: 'My answer' });
    const insertParams = mockQuery.mock.calls[2][1];
    expect(insertParams).toContain(SCHOOL_A);
    expect(insertParams).not.toContain(SCHOOL_B);
  });
});
