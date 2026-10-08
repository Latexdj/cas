'use strict';
/**
 * Principal-portal mirror of the WAEC Results Analysis module
 * (principal.js's /exam-results/* routes). Read-only: these routes
 * delegate to admin-exam-results.js's own listBatches/buildReportForBatch/
 * buildAnalytics (required for real here, not mocked) so this test exercises
 * the actual delegation, not just "was the mock called". Only pool and
 * checkModuleAccess are mocked, the same two seams admin-exam-results.test.js
 * mocks for the same reason.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-principal-exam-results';

const jwt = require('jsonwebtoken');

const SCHOOL_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const PRINCIPAL_ID = 'principal-a-0000-0000-0000-000000000000';

const mockQuery = jest.fn();
jest.mock('../config/db', () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn(),
}));
jest.mock('../middleware/moduleAccess', () => ({
  checkModuleAccess: () => (_req, _res, next) => next(),
}));

const request = require('supertest');
const express = require('express');
const principalRouter = require('../routes/principal');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/principal', principalRouter);
  return app;
}

function managementToken(overrides = {}) {
  return jwt.sign({ id: PRINCIPAL_ID, schoolId: SCHOOL_A, role: 'principal', type: 'management', ...overrides }, process.env.JWT_SECRET);
}

beforeEach(() => { mockQuery.mockReset(); });

describe('Auth gate on the WAEC read-only routes', () => {
  it('401s with no Authorization header', async () => {
    const res = await request(buildApp()).get('/api/principal/exam-results/batches');
    expect(res.status).toBe(401);
  });

  it('403s for a valid token that is not a management-type JWT (e.g. an admin token)', async () => {
    const adminToken = jwt.sign({ id: 'x', schoolId: SCHOOL_A, role: 'admin' }, process.env.JWT_SECRET);
    const res = await request(buildApp()).get('/api/principal/exam-results/batches').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /exam-results/batches', () => {
  it('lists this school\'s WASSCE batches via the shared listBatches() helper', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'b1', exam_body: 'WAEC', year: 2024, school_number: '0100505', source: 'upload', created_at: new Date(), updated_at: new Date(), candidate_count: 50 }] });
    const res = await request(buildApp()).get('/api/principal/exam-results/batches').set('Authorization', `Bearer ${managementToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].year).toBe(2024);
    // Tenant-scoped: schoolId comes from the management token, not a query param.
    expect(mockQuery.mock.calls[0][1]).toContain(SCHOOL_A);
  });
});

describe('GET /exam-results/batches/:id/report', () => {
  it('404s for a batch that does not exist or belongs to another school', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/principal/exam-results/batches/unknown/report').set('Authorization', `Bearer ${managementToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /exam-results/analytics', () => {
  it('returns an empty-but-well-shaped payload when no batches exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // batch list
    const res = await request(buildApp()).get('/api/principal/exam-results/analytics').set('Authorization', `Bearer ${managementToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ years: [], subjects: [], totalCandidates: 0, overallPassRate: 0, rows: [], latestBySubject: [] });
  });
});

describe('GET /exam-results/students/search', () => {
  it('matches by name or index number via the shared searchCandidates() helper', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ index_number: '0100505001', name: 'TEST CANDIDATE', gender: 'Female', year: 2023 }] });
    const res = await request(buildApp()).get('/api/principal/exam-results/students/search').query({ q: 'test' }).set('Authorization', `Bearer ${managementToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /exam-results/students/:year/:indexNumber', () => {
  it('404s when no candidate with that index number exists in that year for this school', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/principal/exam-results/students/2023/0100505999').set('Authorization', `Bearer ${managementToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /exam-results/rankings', () => {
  it('requires a year', async () => {
    const res = await request(buildApp()).get('/api/principal/exam-results/rankings').set('Authorization', `Bearer ${managementToken()}`);
    expect(res.status).toBe(400);
  });

  it('404s when no batch exists for that year', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/principal/exam-results/rankings').query({ year: 1999 }).set('Authorization', `Bearer ${managementToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('No write routes are exposed', () => {
  it('has no POST/PATCH/DELETE for exam-results under the principal router', async () => {
    const token = managementToken();
    const app = buildApp();
    const post = await request(app).post('/api/principal/exam-results/batches').set('Authorization', `Bearer ${token}`).send({});
    const del = await request(app).delete('/api/principal/exam-results/batches/b1').set('Authorization', `Bearer ${token}`);
    // Express reports a path with no matching method as 404, not 405 — either
    // way, confirms nothing accepts a write on this read-only mirror.
    expect(post.status).toBe(404);
    expect(del.status).toBe(404);
  });
});
