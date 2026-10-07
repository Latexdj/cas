'use strict';
/**
 * Contact form — public POST /api/website/:slug/contact and admin CRUD
 * (admin-website-contact.js). Covers required-field/email/length
 * validation, the honeypot silently discarding spam, tenant isolation,
 * and the role guard.
 */

const SCHOOL_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const ADMIN_A  = 'admin-a-0000-0000-0000-000000000000';

let mockCurrentUser   = { id: ADMIN_A, role: 'admin', schoolId: SCHOOL_A };
let mockCurrentSchool = SCHOOL_A;

const mockQuery = jest.fn();
jest.mock('../config/db', () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn(),
}));
// Unused by the public website.js router, but harmless to mock here too —
// lets this one file exercise both the public and admin routers.
jest.mock('../middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = mockCurrentUser; req.schoolId = mockCurrentSchool; next(); },
  requireActiveSubscription: (_req, _res, next) => next(),
  adminOnly: (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  },
}));
jest.mock('../middleware/moduleAccess', () => ({
  isModuleEnabledForSchool: jest.fn().mockResolvedValue(true),
  checkModuleAccess: () => (_req, _res, next) => next(),
}));
// The real rate limiter is IP-keyed and would otherwise start rejecting
// this file's own requests after 5 — not what's under test here.
jest.mock('../middleware/rateLimiter', () => ({
  contactFormLimiter: (_req, _res, next) => next(),
}));

const request = require('supertest');
const express = require('express');
const websiteRouter = require('../routes/website');
const adminContactRouter = require('../routes/admin-website-contact');

function schoolRow(overrides = {}) {
  return {
    school_id: SCHOOL_A, school_name: 'Test School', logo_url: null,
    primary_color: '#0B3D2E', accent_color: '#C8973A',
    motto: null, vision: null, mission: null, core_values: null,
    address: null, phone: null, email: null,
    school_type: 'SHS', headmaster_name: null, region: null, district: null,
    slug: 'test-school', is_published: true, hero_image_url: null, hero_tagline: null,
    show_programs: false, show_admissions_cta: false, show_stats: false,
    ...overrides,
  };
}

function buildPublicApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/website', websiteRouter);
  return app;
}

function buildAdminApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/website/contact', adminContactRouter);
  return app;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockCurrentUser = { id: ADMIN_A, role: 'admin', schoolId: SCHOOL_A };
  mockCurrentSchool = SCHOOL_A;
});

describe('POST /:slug/contact — validation', () => {
  it('rejects a missing name/email/message', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [schoolRow()] });
    const res = await request(buildPublicApp()).post('/api/website/test-school/contact').send({
      name: 'Jane', email: 'jane@example.com',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed email address', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [schoolRow()] });
    const res = await request(buildPublicApp()).post('/api/website/test-school/contact').send({
      name: 'Jane', email: 'not-an-email', message: 'Hello',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized message', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [schoolRow()] });
    const res = await request(buildPublicApp()).post('/api/website/test-school/contact').send({
      name: 'Jane', email: 'jane@example.com', message: 'A'.repeat(1001),
    });
    expect(res.status).toBe(400);
  });

  it('accepts a valid submission and stores it', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [schoolRow()] }) // getSchoolBySlug
      .mockResolvedValueOnce({ rows: [] });             // INSERT
    const res = await request(buildPublicApp()).post('/api/website/test-school/contact').send({
      name: 'Jane', email: 'jane@example.com', phone: '0241234567', message: 'Interested in admissions.',
    });
    expect(res.status).toBe(201);
    expect(mockQuery.mock.calls[1][0]).toMatch(/INSERT INTO website_contact_submissions/);
  });

  it('404s for an unpublished or unknown school, same as every other public route', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildPublicApp()).post('/api/website/no-such-school/contact').send({
      name: 'Jane', email: 'jane@example.com', message: 'Hello',
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /:slug/contact — honeypot', () => {
  it('a filled honeypot field returns success but inserts nothing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [schoolRow()] }); // only getSchoolBySlug runs
    const res = await request(buildPublicApp()).post('/api/website/test-school/contact').send({
      name: 'Bot', email: 'bot@example.com', message: 'spam', website_url: 'http://spam.example.com',
    });
    expect(res.status).toBe(201);
    expect(mockQuery).toHaveBeenCalledTimes(1); // no INSERT call
  });
});

describe('Admin endpoints — tenant isolation and role guard', () => {
  it('PATCH includes school_id in the WHERE params', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] });
    await request(buildAdminApp()).patch('/api/admin/website/contact/sub-1').send({ is_read: true });
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(SCHOOL_A);
  });

  it('DELETE includes school_id in the WHERE params', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] });
    await request(buildAdminApp()).delete('/api/admin/website/contact/sub-1');
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(SCHOOL_A);
  });

  it('DELETE of a non-owned submission 404s', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildAdminApp()).delete('/api/admin/website/contact/sub-owned-by-another-school');
    expect(res.status).toBe(404);
  });

  it('teacher is blocked from the inquiries list (403)', async () => {
    mockCurrentUser = { id: 'teacher-1', role: 'teacher', schoolId: SCHOOL_A };
    const res = await request(buildAdminApp()).get('/api/admin/website/contact');
    expect(res.status).toBe(403);
  });
});
