'use strict';
/**
 * Super admin auth tests — uses the REAL authenticate middleware (no mock).
 * Verifies: (1) test-email now requires auth, (2) session invalidation after
 * password change (token issued before updated_at → 401).
 */

process.env.JWT_SECRET = 'test-jwt-secret-superadmin-2026';

const mockQuery       = jest.fn();
const mockClientQuery = jest.fn();
jest.mock('../config/db', () => ({
  query: mockQuery,
  connect: jest.fn().mockResolvedValue({ query: mockClientQuery, release: jest.fn() }),
}));
jest.mock('../jobs/absenceCheck',       () => ({ runAbsenceCheck: jest.fn() }));
jest.mock('../services/geo.service',   () => ({ getWeekNumber: jest.fn(), calculateDistance: jest.fn() }));
jest.mock('../services/storage.service', () => ({ uploadFile: jest.fn() }));
jest.mock('../services/email.service', () => ({
  sendTestEmail:           jest.fn().mockResolvedValue({ message: 'ok' }),
  sendTeacherCredentials:  jest.fn(),
}));
jest.mock('../services/modules.service', () => ({
  getEnabledModules:     jest.fn().mockResolvedValue([]),
  MODULE_REGISTRY:       [],
  ALL_MODULE_KEYS:       [],
  defaultModulesForType: jest.fn().mockReturnValue([]),
}));
// Do NOT mock '../middleware/auth' — we need the real authenticate middleware.

const jwt     = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');

const adminRouter      = require('../routes/admin');
const superAdminRouter = require('../routes/superAdmin');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin',       adminRouter);
  app.use('/api/super-admin', superAdminRouter);
  return app;
}

const SUPER_ADMIN_TOKEN = jwt.sign(
  { role: 'super_admin', name: 'Super Admin' },
  'test-jwt-secret-superadmin-2026',
  { expiresIn: '1d' }
);

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Fix 1: GET /api/admin/test-email now requires authentication ──────────────

describe('GET /api/admin/test-email — auth gate', () => {
  it('→ 401 with no Authorization header (was 200 before fix)', async () => {
    const res = await request(buildApp()).get('/api/admin/test-email');
    expect(res.status).toBe(401);
  });

  it('→ 401 with a malformed token', async () => {
    const res = await request(buildApp())
      .get('/api/admin/test-email')
      .set('Authorization', 'Bearer garbage.token.value');
    expect(res.status).toBe(401);
  });
});

// ── Fix 2: super_admin session invalidation ───────────────────────────────────

describe('Super admin session invalidation after password change', () => {
  it('→ 401 when token iat is before the last credential update', async () => {
    // Simulate: password changed AFTER this token was signed
    const futureChangedAt = Math.floor(Date.now() / 1000) + 1000;
    mockQuery.mockResolvedValueOnce({ rows: [{ changed_at: futureChangedAt }] });

    const res = await request(buildApp())
      .get('/api/super-admin/stats')
      .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/session expired/i);
  });

  it('→ proceeds normally when token iat is after the last credential update', async () => {
    const pastChangedAt = Math.floor(Date.now() / 1000) - 1000;
    mockQuery
      .mockResolvedValueOnce({ rows: [{ changed_at: pastChangedAt }] }) // creds → old
      .mockResolvedValueOnce({ rows: [{ total_schools: 1, trial_schools: 1, active_schools: 0, expired_schools: 0, total_teachers: 3, attendance_this_month: 20, total_attendance: 200 }] })
      .mockResolvedValueOnce({ rows: [] })   // most_active
      .mockResolvedValueOnce({ rows: [] });  // inactive

    const res = await request(buildApp())
      .get('/api/super-admin/stats')
      .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
  });

  it('→ proceeds when no credentials row exists (env-based auth, no API password change ever made)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no super_admin_credentials row → skip check
      .mockResolvedValueOnce({ rows: [{ total_schools: 0, trial_schools: 0, active_schools: 0, expired_schools: 0, total_teachers: 0, attendance_this_month: 0, total_attendance: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp())
      .get('/api/super-admin/stats')
      .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
  });
});
