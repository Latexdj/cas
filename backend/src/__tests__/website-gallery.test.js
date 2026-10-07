'use strict';
/**
 * Photo Gallery page type — admin-website-gallery.js.
 * Covers ownership scoping of page_id (cross-tenant and wrong page_type),
 * mime-type rejection, caption length limits, the per-gallery image cap,
 * and tenant isolation on update/delete.
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
jest.mock('../services/storage.service', () => ({
  uploadFile: jest.fn().mockResolvedValue('https://example.com/gallery/image.jpg'),
  deleteFile: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const express = require('express');
const galleryRouter = require('../routes/admin-website-gallery');
const { uploadFile } = require('../services/storage.service');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/website/gallery', galleryRouter);
  return app;
}

const PNG_DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

beforeEach(() => {
  mockQuery.mockReset();
  uploadFile.mockClear();
  mockCurrentUser = { id: ADMIN_A, role: 'admin', schoolId: SCHOOL_A };
  mockCurrentSchool = SCHOOL_A;
  mockQuery.mockResolvedValue({ rows: [] });
});

// ── page_id ownership ────────────────────────────────────────────────────────

describe('page_id ownership — POST /', () => {
  it('rejects a page_id that does not belong to the authenticated school', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // getOwnedGalleryPage finds nothing
    const res = await request(buildApp()).post('/api/admin/website/gallery').send({
      page_id: 'page-owned-by-another-school', image_data: PNG_DATA_URI,
    });
    expect(res.status).toBe(400);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('rejects a page_id that belongs to this school but is not page_type = gallery', async () => {
    // The ownership query filters on page_type = 'gallery' itself, so a
    // standard page owned by this school still comes back empty here.
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/admin/website/gallery').send({
      page_id: 'standard-page-1', image_data: PNG_DATA_URI,
    });
    expect(res.status).toBe(400);
  });

  it('accepts a page_id that IS an owned gallery page', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'page-1' }] })   // getOwnedGalleryPage
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })             // count
      .mockResolvedValueOnce({ rows: [{ next: 0 }] })          // max sort_order
      .mockResolvedValueOnce({ rows: [{ id: 'img-1' }] });     // INSERT
    const res = await request(buildApp()).post('/api/admin/website/gallery').send({
      page_id: 'page-1', image_data: PNG_DATA_URI,
    });
    expect(res.status).toBe(201);
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });
});

// ── mime-type validation ─────────────────────────────────────────────────────

describe('Image mime-type validation', () => {
  it('rejects a non-image data URI', async () => {
    const res = await request(buildApp()).post('/api/admin/website/gallery').send({
      page_id: 'page-1', image_data: 'data:application/pdf;base64,JVBERi0xLjQK',
    });
    expect(res.status).toBe(400);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('rejects a non-data-URI string entirely (e.g. a raw URL)', async () => {
    const res = await request(buildApp()).post('/api/admin/website/gallery').send({
      page_id: 'page-1', image_data: 'https://evil.example.com/not-a-data-uri',
    });
    expect(res.status).toBe(400);
  });

  it('accepts a real image data URI', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'page-1' }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ next: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'img-1' }] });
    const res = await request(buildApp()).post('/api/admin/website/gallery').send({
      page_id: 'page-1', image_data: PNG_DATA_URI,
    });
    expect(res.status).toBe(201);
  });
});

// ── Caption length ───────────────────────────────────────────────────────────

describe('Caption length validation', () => {
  it('rejects a caption over 150 characters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'page-1' }] });
    const res = await request(buildApp()).post('/api/admin/website/gallery').send({
      page_id: 'page-1', image_data: PNG_DATA_URI, caption: 'A'.repeat(151),
    });
    expect(res.status).toBe(400);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('accepts a caption at exactly the 150-character limit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'page-1' }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ next: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'img-1' }] });
    const res = await request(buildApp()).post('/api/admin/website/gallery').send({
      page_id: 'page-1', image_data: PNG_DATA_URI, caption: 'A'.repeat(150),
    });
    expect(res.status).toBe(201);
  });

  it('PATCH also enforces the caption limit', async () => {
    const res = await request(buildApp()).patch('/api/admin/website/gallery/img-1').send({
      caption: 'A'.repeat(151),
    });
    expect(res.status).toBe(400);
  });
});

// ── Per-gallery image cap ────────────────────────────────────────────────────

describe('Gallery image cap', () => {
  it('rejects a 41st image on an already-full gallery', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'page-1' }] })  // getOwnedGalleryPage
      .mockResolvedValueOnce({ rows: [{ n: 40 }] });          // count already at the cap
    const res = await request(buildApp()).post('/api/admin/website/gallery').send({
      page_id: 'page-1', image_data: PNG_DATA_URI,
    });
    expect(res.status).toBe(400);
    expect(uploadFile).not.toHaveBeenCalled();
  });
});

// ── Tenant isolation ─────────────────────────────────────────────────────────

describe('Tenant isolation — PATCH/DELETE scope every query by school_id', () => {
  it('PATCH includes school_id in the WHERE params', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'img-1' }] });
    await request(buildApp()).patch('/api/admin/website/gallery/img-1').send({ caption: 'Updated' });
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(SCHOOL_A);
  });

  it('DELETE includes school_id in the WHERE params and cleans up storage', async () => {
    const { deleteFile } = require('../services/storage.service');
    mockQuery.mockResolvedValueOnce({ rows: [{ storage_path: 'website/x/gallery/page-1/a.jpg' }] });
    const res = await request(buildApp()).delete('/api/admin/website/gallery/img-1');
    expect(res.status).toBe(200);
    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(SCHOOL_A);
    expect(deleteFile).toHaveBeenCalledWith('website/x/gallery/page-1/a.jpg');
  });

  it('DELETE of a non-owned image 404s without touching storage', async () => {
    const { deleteFile } = require('../services/storage.service');
    deleteFile.mockClear();
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).delete('/api/admin/website/gallery/img-owned-by-another-school');
    expect(res.status).toBe(404);
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

// ── Role guard ──────────────────────────────────────────────────────────────

describe('Role guard', () => {
  it('teacher is blocked from gallery management (403)', async () => {
    mockCurrentUser = { id: 'teacher-1', role: 'teacher', schoolId: SCHOOL_A };
    const res = await request(buildApp()).get('/api/admin/website/gallery').query({ page_id: 'page-1' });
    expect(res.status).toBe(403);
  });
});
