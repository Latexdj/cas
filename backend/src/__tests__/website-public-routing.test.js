'use strict';
/**
 * Phase 1 regression suite — public website.js routes.
 * Covers draft/published visibility and tenant isolation on the no-auth
 * public endpoints (the part real site visitors actually hit).
 */

const SCHOOL_A = 'aaaaaaaa-0000-0000-0000-000000000000';

const mockQuery = jest.fn();
jest.mock('../config/db', () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn(),
}));

const mockIsModuleEnabled = jest.fn().mockResolvedValue(true);
jest.mock('../middleware/moduleAccess', () => ({
  isModuleEnabledForSchool: (...args) => mockIsModuleEnabled(...args),
}));

const request = require('supertest');
const express = require('express');
const websiteRouter = require('../routes/website');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/website', websiteRouter);
  return app;
}

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

beforeEach(() => {
  jest.clearAllMocks();
  mockIsModuleEnabled.mockResolvedValue(true);
});

describe('GET /:slug/pages/:pageSlug — draft/published visibility', () => {
  it('404s for a slug that does not resolve to any published site', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // getSchoolBySlug finds nothing
    const res = await request(buildApp()).get('/api/website/no-such-school/pages/about');
    expect(res.status).toBe(404);
  });

  it('404s when the site itself is unpublished, even for a real page slug', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [schoolRow({ is_published: false })] });
    const res = await request(buildApp()).get('/api/website/test-school/pages/about');
    expect(res.status).toBe(404);
    // Must short-circuit before ever querying website_pages for an unpublished site.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('404s for a draft page on an otherwise published site — drafts never leak publicly', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [schoolRow()] })
      .mockResolvedValueOnce({ rows: [] }); // status='published' filter excludes the draft row
    const res = await request(buildApp()).get('/api/website/test-school/pages/draft-page');
    expect(res.status).toBe(404);
    const pageQueryParams = mockQuery.mock.calls[1][0];
    expect(pageQueryParams).toMatch(/status = 'published'/);
  });

  it('200s for a published page on a published site', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [schoolRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 'page-1', slug: 'about', title: 'About', content: '<p>Hi</p>' }] });
    const res = await request(buildApp()).get('/api/website/test-school/pages/about');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('About');
  });

  it('404s when the website module is disabled for the school, even if published', async () => {
    mockIsModuleEnabled.mockResolvedValue(false);
    mockQuery.mockResolvedValueOnce({ rows: [schoolRow()] });
    const res = await request(buildApp()).get('/api/website/test-school/pages/about');
    expect(res.status).toBe(404);
  });

  it('never exposes database error details in the response', async () => {
    mockQuery.mockRejectedValueOnce(new Error('relation "website_pages" does not exist'));
    const res = await request(buildApp()).get('/api/website/test-school/pages/about');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|does not exist/);
  });
});

describe('GET /:slug/menu — only published, visible items reach the public API', () => {
  it('excludes items linked to a draft/unpublished page', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [schoolRow()] })
      .mockResolvedValueOnce({ rows: [] }); // the SQL's own status='published' filter would exclude it server-side
    const res = await request(buildApp()).get('/api/website/test-school/menu');
    expect(res.status).toBe(200);
    expect(res.body.header).toEqual([]);
    const menuQuerySQL = mockQuery.mock.calls[1][0];
    expect(menuQuerySQL).toMatch(/is_visible = true/);
    expect(menuQuerySQL).toMatch(/p\.status = 'published'/);
  });

  it('scopes the menu query to this school only', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [schoolRow()] })
      .mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/api/website/test-school/menu');
    const params = mockQuery.mock.calls[1][1];
    expect(params).toEqual([SCHOOL_A]);
  });
});
