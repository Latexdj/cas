'use strict';
/**
 * Super admin portal policy tests — mocked auth, focused on:
 * - Role guards (super_admin vs other roles)
 * - test-email admin access (Fix 1)
 * - modules update school-check + audit log (Fix 3)
 * - DELETE school confirmation safeguard (Fix 4)
 * - School code generation uses MAX not COUNT (Fix 6)
 */

const SCHOOL_ID = 'school-00-0000-0000-0000-000000000000';

let mockCurrentUser   = { id: 'sa-1', role: 'super_admin', schoolId: null };
let mockCurrentSchool = null;

const mockQuery       = jest.fn();
const mockClientQuery = jest.fn();
const mockAuditLog    = jest.fn().mockResolvedValue(undefined);

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
  superAdminOnly: (req, res, next) => {
    if (req.user?.role !== 'super_admin')
      return res.status(403).json({ error: 'Super admin access required' });
    next();
  },
  clearSubCache: jest.fn(),
}));
jest.mock('../utils/audit', () => ({ auditLog: mockAuditLog }));
jest.mock('../jobs/absenceCheck',        () => ({ runAbsenceCheck: jest.fn() }));
jest.mock('../services/geo.service',    () => ({ getWeekNumber: jest.fn(), calculateDistance: jest.fn() }));
jest.mock('../services/storage.service', () => ({ uploadFile: jest.fn() }));
jest.mock('../services/email.service',  () => ({
  sendTestEmail:           jest.fn().mockResolvedValue({ message: 'ok' }),
  sendTeacherCredentials:  jest.fn(),
}));
jest.mock('../services/modules.service', () => ({
  getEnabledModules:     jest.fn().mockResolvedValue([]),
  MODULE_REGISTRY:       [],
  ALL_MODULE_KEYS:       ['fees', 'library', 'exams'],
  defaultModulesForType: jest.fn().mockReturnValue([]),
}));

const request          = require('supertest');
const express          = require('express');
const adminRouter      = require('../routes/admin');
const schoolsRouter    = require('../routes/schools');
const superAdminRouter = require('../routes/superAdmin');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin',       adminRouter);
  app.use('/api/schools',     schoolsRouter);
  app.use('/api/super-admin', superAdminRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser   = { id: 'sa-1', role: 'super_admin', schoolId: null };
  mockCurrentSchool = null;
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Role guards ───────────────────────────────────────────────────────────────

describe('Role guard — super_admin endpoints reject lower roles', () => {
  it('GET /api/super-admin/stats → 403 for teacher', async () => {
    mockCurrentUser = { id: 't-1', role: 'teacher', schoolId: SCHOOL_ID };
    const res = await request(buildApp()).get('/api/super-admin/stats');
    expect(res.status).toBe(403);
  });

  it('GET /api/super-admin/stats → 403 for admin', async () => {
    mockCurrentUser = { id: 'a-1', role: 'admin', schoolId: SCHOOL_ID };
    const res = await request(buildApp()).get('/api/super-admin/stats');
    expect(res.status).toBe(403);
  });

  it('GET /api/super-admin/audit-log → 403 for teacher', async () => {
    mockCurrentUser = { id: 't-1', role: 'teacher', schoolId: SCHOOL_ID };
    const res = await request(buildApp()).get('/api/super-admin/audit-log');
    expect(res.status).toBe(403);
  });
});

// ── Fix 1: test-email role check ──────────────────────────────────────────────

describe('GET /api/admin/test-email — role access (mocked auth)', () => {
  it('→ 200 for admin role', async () => {
    mockCurrentUser  = { id: 'a-1', role: 'admin', schoolId: SCHOOL_ID };
    mockCurrentSchool = SCHOOL_ID;
    const res = await request(buildApp()).get('/api/admin/test-email');
    expect(res.status).toBe(200);
  });

  it('→ 200 for super_admin role', async () => {
    const res = await request(buildApp()).get('/api/admin/test-email');
    expect(res.status).toBe(200);
  });

  it('→ 403 for teacher role', async () => {
    mockCurrentUser  = { id: 't-1', role: 'teacher', schoolId: SCHOOL_ID };
    mockCurrentSchool = SCHOOL_ID;
    const res = await request(buildApp()).get('/api/admin/test-email');
    expect(res.status).toBe(403);
  });
});

// ── Fix 3: PUT /api/schools/:id/modules — school check + audit log ────────────

describe('PUT /api/schools/:id/modules', () => {
  it('→ 400 when modules body is missing', async () => {
    const res = await request(buildApp())
      .put(`/api/schools/${SCHOOL_ID}/modules`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('→ 404 when school does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // school lookup → not found
    const res = await request(buildApp())
      .put(`/api/schools/${SCHOOL_ID}/modules`)
      .send({ modules: { fees: true } });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/school not found/i);
  });

  it('→ 200 and calls auditLog when school exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ name: 'Test School' }] });
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // DELETE school_modules
      .mockResolvedValueOnce({ rows: [] }) // INSERT fees
      .mockResolvedValueOnce({ rows: [] }) // INSERT library
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(buildApp())
      .put(`/api/schools/${SCHOOL_ID}/modules`)
      .send({ modules: { fees: true, library: false } });

    expect(res.status).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'modules_updated',
      'school',
      SCHOOL_ID,
      'Test School',
      expect.objectContaining({ modules: expect.any(Object) })
    );
  });

  it('does not call auditLog when school is not found (rolls back)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(buildApp())
      .put(`/api/schools/${SCHOOL_ID}/modules`)
      .send({ modules: { fees: true } });
    expect(mockAuditLog).not.toHaveBeenCalled();
  });
});

// ── Fix 4: DELETE /api/schools/:id — confirmation safeguard ──────────────────

describe('DELETE /api/schools/:id — confirmation required', () => {
  it('→ 400 with no body', async () => {
    const res = await request(buildApp()).delete(`/api/schools/${SCHOOL_ID}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirm/i);
  });

  it('→ 400 when confirm is false', async () => {
    const res = await request(buildApp())
      .delete(`/api/schools/${SCHOOL_ID}`)
      .send({ confirm: false });
    expect(res.status).toBe(400);
  });

  it('→ 400 when confirm is the string "true" (not boolean)', async () => {
    const res = await request(buildApp())
      .delete(`/api/schools/${SCHOOL_ID}`)
      .send({ confirm: 'true' });
    expect(res.status).toBe(400);
  });

  it('→ 404 when confirm is true but school not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp())
      .delete(`/api/schools/${SCHOOL_ID}`)
      .send({ confirm: true });
    expect(res.status).toBe(404);
  });

  it('→ 200 when confirm:true and school exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ name: 'Test School' }] }) // SELECT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });            // DELETE
    const res = await request(buildApp())
      .delete(`/api/schools/${SCHOOL_ID}`)
      .send({ confirm: true });
    expect(res.status).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith('school_deleted', 'school', SCHOOL_ID, 'Test School', expect.any(Object));
  });
});

// ── Fix 6: POST /api/schools — school code uses MAX not COUNT ─────────────────

describe('POST /api/schools — school code generation', () => {
  it('uses MAX of existing codes (FOR UPDATE) — not COUNT', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                          // BEGIN
      .mockResolvedValueOnce({ rows: [{ next_num: 7 }] })          // MAX ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 'new-id', name: 'New School', code: 'CAS007', school_type: 'SHS', school_category: 'Public', email: 'new@s.com' }] }) // INSERT schools
      .mockResolvedValueOnce({ rows: [{ id: 'plan-id' }] })        // SELECT plans (trial)
      .mockResolvedValueOnce({ rows: [] })                          // INSERT subscriptions
      .mockResolvedValueOnce({ rows: [{ id: 'teacher-id', name: 'Admin' }] }) // INSERT teachers
      .mockResolvedValueOnce({ rows: [] });                         // COMMIT

    await request(buildApp())
      .post('/api/schools')
      .send({ name: 'New School', email: 'new@s.com', adminName: 'Admin', adminPin: '1234' });

    const maxCall = mockClientQuery.mock.calls.find(c => String(c[0]).includes('MAX'));
    expect(maxCall).toBeDefined();
    expect(String(maxCall[0])).toContain('FOR UPDATE');
    expect(String(maxCall[0])).not.toContain('COUNT');
  });
});
