'use strict';
/**
 * Phase 1 regression suite — admin-website-pages.js.
 * Covers tenant isolation, slug normalization, homepage slug protection,
 * status validation, and server-side HTML sanitization.
 */

const SCHOOL_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const SCHOOL_B = 'bbbbbbbb-0000-0000-0000-000000000000';
const ADMIN_A  = 'admin-a-0000-0000-0000-000000000000';

let mockCurrentUser   = { id: ADMIN_A, role: 'admin', schoolId: SCHOOL_A };
let mockCurrentSchool = SCHOOL_A;

const mockQuery = jest.fn();
jest.mock('../config/db', () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn(),
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
jest.mock('../services/storage.service', () => ({
  uploadFile: jest.fn().mockResolvedValue('https://example.com/image.png'),
}));

const request = require('supertest');
const express = require('express');
const pagesRouter = require('../routes/admin-website-pages');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/website/pages', pagesRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = { id: ADMIN_A, role: 'admin', schoolId: SCHOOL_A };
  mockCurrentSchool = SCHOOL_A;
  mockQuery.mockResolvedValue({ rows: [] });
});

// ── Tenant isolation ───────────────────────────────────────────────────────

describe('Tenant isolation — GET /:id', () => {
  it('scopes the lookup by the authenticated school_id, never another school', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'page-1', school_id: SCHOOL_A }] });
    await request(buildApp()).get('/api/admin/website/pages/page-1');
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(SCHOOL_A);
    expect(params).not.toContain(SCHOOL_B);
  });

  it('returns 404 (not another school\'s data) when the row is not found for this school_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/admin/website/pages/page-owned-by-b');
    expect(res.status).toBe(404);
  });
});

describe('Tenant isolation — PATCH/DELETE/duplicate scope every query by school_id', () => {
  it('PATCH includes school_id in the WHERE params', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ slug: 'about', is_homepage: false }] }) // current-row lookup
      .mockResolvedValueOnce({ rows: [{ id: 'page-1' }] });                      // UPDATE ... RETURNING
    await request(buildApp()).patch('/api/admin/website/pages/page-1').send({ title: 'New title' });
    const updateParams = mockQuery.mock.calls[1][1];
    expect(updateParams).toContain(SCHOOL_A);
  });

  it('DELETE includes school_id in the WHERE params', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'page-1' }] });
    await request(buildApp()).delete('/api/admin/website/pages/page-1');
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(SCHOOL_A);
  });

  it('duplicate 404s instead of cloning another school\'s page', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // source lookup scoped to SCHOOL_A finds nothing
    const res = await request(buildApp()).post('/api/admin/website/pages/page-owned-by-b/duplicate');
    expect(res.status).toBe(404);
  });
});

// ── Role guard ──────────────────────────────────────────────────────────────

describe('Role guard', () => {
  it('teacher is blocked from the pages list (403, not silently empty)', async () => {
    mockCurrentUser = { id: 'teacher-1', role: 'teacher', schoolId: SCHOOL_A };
    const res = await request(buildApp()).get('/api/admin/website/pages');
    expect(res.status).toBe(403);
  });

  it('management/principal role is blocked (website admin is admin-role-only)', async () => {
    mockCurrentUser = { id: 'principal-1', type: 'management', role: 'principal', schoolId: SCHOOL_A };
    const res = await request(buildApp()).get('/api/admin/website/pages');
    expect(res.status).toBe(403);
  });
});

// ── Slug normalization ───────────────────────────────────────────────────────

describe('Slug normalization', () => {
  it('rejects a slug that normalizes to nothing', async () => {
    const res = await request(buildApp()).post('/api/admin/website/pages').send({ slug: '!!! ???', title: 'X' });
    expect(res.status).toBe(400);
  });

  it('normalizes spaces/punctuation/accents into a safe URL slug', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-page', slug: 'kwame-hall' }] });
    await request(buildApp()).post('/api/admin/website/pages').send({ slug: 'Kwamé Hall!!', title: 'Kwamé Hall' });
    const insertParams = mockQuery.mock.calls[0][1];
    expect(insertParams[1]).toBe('kwame-hall');
  });

  it('rejects slug and title missing entirely', async () => {
    const res = await request(buildApp()).post('/api/admin/website/pages').send({});
    expect(res.status).toBe(400);
  });
});

// ── Homepage protection ───────────────────────────────────────────────────────

describe('Homepage slug protection', () => {
  it('rejects changing the homepage\'s slug via PATCH', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'home', is_homepage: true }] });
    const res = await request(buildApp()).patch('/api/admin/website/pages/home-id').send({ slug: 'renamed' });
    expect(res.status).toBe(400);
  });

  it('allows other fields to update on the homepage without touching its slug', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ slug: 'home', is_homepage: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'home-id' }] });
    const res = await request(buildApp()).patch('/api/admin/website/pages/home-id').send({ title: 'Welcome' });
    expect(res.status).toBe(200);
  });

  it('the DELETE query itself still carries is_homepage = false as a DB-level backstop', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).delete('/api/admin/website/pages/home-id');
    expect(res.status).toBe(404);
    expect(mockQuery.mock.calls[0][0]).toMatch(/is_homepage = false/);
  });
});

// ── Status validation ─────────────────────────────────────────────────────────

describe('Status validation', () => {
  it('rejects a status value outside draft/published', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ slug: 'about', is_homepage: false }] });
    const res = await request(buildApp()).patch('/api/admin/website/pages/page-1').send({ status: 'archived' });
    expect(res.status).toBe(400);
  });
});

// ── Server-side sanitization ───────────────────────────────────────────────────

describe('Content sanitization', () => {
  it('strips <script> tags from page content before it reaches the database', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-page' }] });
    await request(buildApp()).post('/api/admin/website/pages').send({
      slug: 'xss-test', title: 'XSS', content: '<p>hi</p><script>alert(1)</script>',
    });
    const insertedContent = mockQuery.mock.calls[0][1][7];
    expect(insertedContent).not.toContain('<script>');
    expect(insertedContent).toContain('<p>hi</p>');
  });

  it('strips event-handler attributes and javascript: hrefs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-page' }] });
    await request(buildApp()).post('/api/admin/website/pages').send({
      slug: 'xss-test-2', title: 'XSS2', content: '<a href="javascript:alert(1)">click</a><img src=x onerror=alert(1)>',
    });
    const insertedContent = mockQuery.mock.calls[0][1][7];
    expect(insertedContent).not.toContain('javascript:');
    expect(insertedContent).not.toContain('onerror');
  });
});
