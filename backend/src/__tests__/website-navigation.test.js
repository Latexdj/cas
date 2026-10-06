'use strict';
/**
 * Phase 1 regression suite — admin-website-menu.js.
 * Covers cross-tenant page_id/parent_id injection (the confirmed defect
 * fixed during Phase 1 QA), external_url scheme validation, and
 * self-parenting protection.
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

const request = require('supertest');
const express = require('express');
const menuRouter = require('../routes/admin-website-menu');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/website/menu', menuRouter);
  return app;
}

beforeEach(() => {
  // mockReset (not clearAllMocks) — clearAllMocks only wipes call history,
  // it leaves any queued mockResolvedValueOnce() responses a previous test
  // didn't fully consume sitting in the queue, where they leak into the
  // next test's first query call. mockReset wipes the queue too.
  mockQuery.mockReset();
  mockCurrentUser = { id: ADMIN_A, role: 'admin', schoolId: SCHOOL_A };
  mockCurrentSchool = SCHOOL_A;
  mockQuery.mockResolvedValue({ rows: [] });
});

// ── Cross-tenant page_id / parent_id injection (confirmed-and-fixed defect) ──

describe('Cross-tenant resource injection — POST /', () => {
  it('rejects a page_id that does not belong to the authenticated school (ownership check empty)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership SELECT finds nothing under SCHOOL_A
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'Sneaky', page_id: 'page-owned-by-another-school',
    });
    expect(res.status).toBe(400);
  });

  it('accepts a page_id that IS owned by the authenticated school', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] })            // ownership check passes
      .mockResolvedValueOnce({ rows: [{ next: 0 }] })          // sort_order lookup
      .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });    // INSERT
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'Legit', page_id: 'own-page-id',
    });
    expect(res.status).toBe(201);
  });

  it('rejects a parent_id that does not belong to the authenticated school', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // parent ownership check finds nothing
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'Sneaky Child', external_url: '#x', parent_id: 'parent-owned-by-another-school',
    });
    expect(res.status).toBe(400);
  });
});

// ── One-level nesting enforcement (server-side, not just UI) ─────────────────

describe('One-level nesting — POST / rejects a grandchild', () => {
  it('rejects nesting under a parent that is itself already a child', async () => {
    // Ownership check returns a row WITH a non-null parent_id — i.e. the
    // chosen "parent" is already nested one level deep.
    mockQuery.mockResolvedValueOnce({ rows: [{ parent_id: 'top-level-item' }] });
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'Grandchild Attempt', external_url: '#x', parent_id: 'already-a-child',
    });
    expect(res.status).toBe(400);
  });

  it('accepts nesting under a genuinely top-level parent', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ parent_id: null }] }) // parent is top-level
      .mockResolvedValueOnce({ rows: [{ next: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'Valid Child', external_url: '#x', parent_id: 'top-level-item',
    });
    expect(res.status).toBe(201);
  });
});

describe('One-level nesting — PATCH /:id rejects creating a grandchild either direction', () => {
  it('rejects re-parenting under an already-nested item (direct grandchild)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ parent_id: 'top-level-item' }] }); // target parent is itself a child
    const res = await request(buildApp()).patch('/api/admin/website/menu/item-1').send({ parent_id: 'already-a-child' });
    expect(res.status).toBe(400);
  });

  it('rejects re-parenting an item that already has children of its own (indirect grandchild)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ parent_id: null }] })   // chosen parent is top-level — fine on its own
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] });              // but the item being moved already has children
    const res = await request(buildApp()).patch('/api/admin/website/menu/item-with-children').send({ parent_id: 'some-top-level-item' });
    expect(res.status).toBe(400);
  });

  it('allows re-parenting a genuinely childless item under a genuinely top-level item', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ parent_id: null }] })
      .mockResolvedValueOnce({ rows: [] }) // no children of its own
      .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] }); // UPDATE
    const res = await request(buildApp()).patch('/api/admin/website/menu/item-1').send({ parent_id: 'top-level-item' });
    expect(res.status).toBe(200);
  });
});

describe('Cross-tenant resource injection — PATCH /:id', () => {
  it('rejects re-pointing an existing menu item at another school\'s page', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ownership check empty
    const res = await request(buildApp()).patch('/api/admin/website/menu/item-1').send({ page_id: 'page-owned-by-another-school' });
    expect(res.status).toBe(400);
  });

  it('rejects a menu item being set as its own parent (would create a circular tree)', async () => {
    const res = await request(buildApp()).patch('/api/admin/website/menu/item-1').send({ parent_id: 'item-1' });
    expect(res.status).toBe(400);
  });
});

// ── external_url scheme validation (confirmed-and-fixed defect) ──────────────

describe('external_url scheme validation', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ])('rejects dangerous scheme: %s', async (url) => {
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'Evil', external_url: url,
    });
    expect(res.status).toBe(400);
  });

  it.each([
    '#anchor',
    '/relative/path',
    'https://example.com',
    'http://example.com',
  ])('accepts safe URL: %s', async (url) => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ next: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'Fine', external_url: url,
    });
    expect(res.status).toBe(201);
  });
});

// ── Basic validation ───────────────────────────────────────────────────────────

describe('Basic field validation', () => {
  it('requires either page_id or external_url', async () => {
    const res = await request(buildApp()).post('/api/admin/website/menu').send({ location: 'header', label: 'No target' });
    expect(res.status).toBe(400);
  });

  it('rejects both page_id and external_url set at once', async () => {
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'Both', page_id: 'p1', external_url: '#x',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid location value', async () => {
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'sidebar', label: 'Bad location', external_url: '#x',
    });
    expect(res.status).toBe(400);
  });
});

// ── Label length validation ────────────────────────────────────────────────

describe('Label length validation', () => {
  it('rejects a menu label over 60 characters', async () => {
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'A'.repeat(61), external_url: '#x',
    });
    expect(res.status).toBe(400);
  });

  it('accepts a menu label at exactly the 60-character limit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ next: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'A'.repeat(60), external_url: '#x',
    });
    expect(res.status).toBe(201);
  });

  it('a normal, realistic label is unaffected', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ next: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });
    const res = await request(buildApp()).post('/api/admin/website/menu').send({
      location: 'header', label: 'Student Life & Activities', external_url: '#x',
    });
    expect(res.status).toBe(201);
  });
});

// ── Role guard ──────────────────────────────────────────────────────────────

describe('Role guard', () => {
  it('teacher is blocked from navigation management (403)', async () => {
    mockCurrentUser = { id: 'teacher-1', role: 'teacher', schoolId: SCHOOL_A };
    const res = await request(buildApp()).get('/api/admin/website/menu');
    expect(res.status).toBe(403);
  });
});
