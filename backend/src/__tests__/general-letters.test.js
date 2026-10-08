'use strict';
/**
 * general-letters.js — focused on the two features just added on top of
 * this previously-untested route file: issued_as (own office vs on behalf
 * of the Head, and its tie into requires_approval) and the teacher-facing
 * acceptance flow (GET /mine, GET /:id ownership, POST /:id/accept|decline).
 * Not a full retrofit of every pre-existing route.
 */

const SCHOOL_A   = 'aaaaaaaa-0000-0000-0000-000000000000';
const ADMIN_A    = 'admin-a-0000-0000-0000-000000000000';
const TEACHER_A  = 'teacher-a-000-0000-0000-000000000000';
const TEACHER_B  = 'teacher-b-000-0000-0000-000000000000';

let mockCurrentUser = { id: ADMIN_A, role: 'admin', schoolId: SCHOOL_A };

const mockQuery = jest.fn();
jest.mock('../config/db', () => ({ query: (...args) => mockQuery(...args) }));
jest.mock('../middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = mockCurrentUser; req.schoolId = mockCurrentUser.schoolId; next(); },
  requireActiveSubscription: (_req, _res, next) => next(),
  managementOnly: (req, res, next) => {
    if (req.user?.type !== 'management') return res.status(403).json({ error: 'Management access required' });
    next();
  },
}));
jest.mock('../middleware/moduleAccess', () => ({
  checkModuleAccess: () => (_req, _res, next) => next(),
}));
jest.mock('../utils/richTextSanitizer', () => ({
  sanitizeRichText: (html) => html,
}));
// pdf.service.js top-level requires @sparticuz/chromium, an ESM-only
// package Jest can't transform — mock it out since none of these tests
// exercise PDF generation itself.
jest.mock('../services/pdf.service', () => ({
  generateAndUploadPDF: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const generalLettersRouter = require('../routes/general-letters');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/general-letters', generalLettersRouter);
  return app;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockCurrentUser = { id: ADMIN_A, role: 'admin', schoolId: SCHOOL_A };
});

describe('POST / — issued_as ties into requires_approval', () => {
  function postBody(overrides = {}) {
    return {
      classification: 'internal_administrative',
      recipient_type: 'teacher',
      internal_recipient_id: TEACHER_A,
      internal_recipient_table: 'teachers',
      subject: 'Appointment as Senior Housemaster',
      body: '<p>Congratulations.</p>',
      issued_date: '2026-01-01',
      ...overrides,
    };
  }

  it('"own_office" with a non-triggering classification issues immediately', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: TEACHER_A }] }) // recipient FK check
      .mockResolvedValueOnce({ rows: [{ name: 'Admin User' }] }) // resolveIssuedBy
      .mockResolvedValueOnce({ rows: [{ letter_ref_counter: 1, letter_ref_prefix: null, headmaster_signature_url: 'sig.png' }] }) // generateRefNumber
      .mockResolvedValueOnce({ rows: [{ id: 'letter-1', status: 'issued', recipient_type: 'teacher', internal_recipient_id: TEACHER_A, school_id: SCHOOL_A, subject: 'x', requires_acceptance: false }] }) // INSERT
      ; // no notifyTeacherIfIssued query expected since requires_acceptance is false... still inserts a notification row regardless of requires_acceptance wording, see next test
    mockQuery.mockResolvedValueOnce({ rows: [] }); // notification insert

    const res = await request(buildApp()).post('/api/general-letters').send(postBody({ issued_as: 'own_office' }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('issued');
  });

  it('"on_behalf_of_head" requires approval even for a classification that otherwise wouldn\'t', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: TEACHER_A }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Admin User' }] })
      .mockResolvedValueOnce({ rows: [{ letter_ref_counter: 1, letter_ref_prefix: null, headmaster_signature_url: 'sig.png' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'letter-2', status: 'pending_approval', recipient_type: 'teacher', internal_recipient_id: TEACHER_A, school_id: SCHOOL_A, subject: 'x', requires_acceptance: false }] });

    const res = await request(buildApp()).post('/api/general-letters').send(postBody({ issued_as: 'on_behalf_of_head' }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_approval');
    // pending_approval means not yet issued — no notification insert this call
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('defaults to "on_behalf_of_head" (and therefore requires approval) when issued_as is omitted', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: TEACHER_A }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Admin User' }] })
      .mockResolvedValueOnce({ rows: [{ letter_ref_counter: 1, letter_ref_prefix: null, headmaster_signature_url: 'sig.png' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'letter-3', status: 'pending_approval', recipient_type: 'teacher', internal_recipient_id: TEACHER_A, school_id: SCHOOL_A, subject: 'x', requires_acceptance: false }] });

    const res = await request(buildApp()).post('/api/general-letters').send(postBody());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_approval');
  });
});

describe('GET /mine — teacher-scoped letter list', () => {
  it('403s for a non-teacher, non-admin role', async () => {
    mockCurrentUser = { id: 'parent-x', role: 'parent', schoolId: SCHOOL_A };
    const res = await request(buildApp()).get('/api/general-letters/mine');
    expect(res.status).toBe(403);
  });

  it('scopes the query to the calling teacher, not any id the client could pass', async () => {
    mockCurrentUser = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_A };
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'letter-1', subject: 'Appointment' }] });
    const res = await request(buildApp()).get('/api/general-letters/mine');
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual([SCHOOL_A, TEACHER_A]);
  });
});

describe('GET /:id — teacher ownership check', () => {
  it('404s (not 403) when the letter exists but is addressed to a different teacher', async () => {
    mockCurrentUser = { id: TEACHER_B, role: 'teacher', schoolId: SCHOOL_A };
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 'letter-1', recipient_type: 'teacher', internal_recipient_id: TEACHER_A, school_id: SCHOOL_A,
    }] });
    const res = await request(buildApp()).get('/api/general-letters/letter-1');
    expect(res.status).toBe(404);
  });

  it('200s when the letter is actually addressed to the calling teacher', async () => {
    mockCurrentUser = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_A };
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 'letter-1', recipient_type: 'teacher', internal_recipient_id: TEACHER_A, school_id: SCHOOL_A, subject: 'x',
    }] });
    const res = await request(buildApp()).get('/api/general-letters/letter-1');
    expect(res.status).toBe(200);
    expect(res.body.return_history).toEqual([]); // not fetched for a non-staff caller
  });

  it('403s a non-teacher, non-staff caller outright', async () => {
    mockCurrentUser = { id: 'student-x', role: 'student', schoolId: SCHOOL_A };
    const res = await request(buildApp()).get('/api/general-letters/letter-1');
    expect(res.status).toBe(403);
  });
});

describe('POST /:id/accept and /:id/decline', () => {
  beforeEach(() => { mockCurrentUser = { id: TEACHER_A, role: 'teacher', schoolId: SCHOOL_A }; });

  it('accept 404s when the letter is not an owned, pending-acceptance letter (wrong owner, wrong status, or already responded)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/general-letters/letter-1/accept');
    expect(res.status).toBe(404);
  });

  it('accept succeeds and is scoped by teacher id in the query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'letter-1', accepted_at: '2026-01-02T00:00:00.000Z' }] });
    const res = await request(buildApp()).post('/api/general-letters/letter-1/accept');
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(['letter-1', SCHOOL_A, TEACHER_A]);
  });

  it('decline requires a reason', async () => {
    const res = await request(buildApp()).post('/api/general-letters/letter-1/decline').send({});
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('decline succeeds with a reason and stores it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'letter-1', declined_at: '2026-01-02T00:00:00.000Z', decline_reason: 'Prefer not to relocate' }] });
    const res = await request(buildApp()).post('/api/general-letters/letter-1/decline').send({ reason: 'Prefer not to relocate' });
    expect(res.status).toBe(200);
    expect(res.body.decline_reason).toBe('Prefer not to relocate');
  });
});

describe('PATCH /:id — correcting a letter issued wrongly', () => {
  function editBody(overrides = {}) {
    return {
      classification: 'internal_administrative',
      recipient_type: 'external',
      ext_recipient_title: 'THE DISTRICT DIRECTOR',
      subject: 'Corrected subject',
      body: '<p>Corrected body.</p>',
      issued_date: '2026-01-01',
      issued_as: 'own_office',
      ...overrides,
    };
  }

  it('400s on a letter that is not issued or pending_approval', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'letter-1', status: 'voided' }] });
    const res = await request(buildApp()).patch('/api/general-letters/letter-1').send(editBody());
    expect(res.status).toBe(400);
  });

  it('404s when the letter does not exist in this school', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).patch('/api/general-letters/letter-1').send(editBody());
    expect(res.status).toBe(404);
  });

  it('an own_office edit with no other approval trigger keeps the letter issued, clears pdf_url, and stamps the editor', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'letter-1', status: 'issued', classification: 'internal_administrative', issued_as: 'own_office' }] }) // existing
      .mockResolvedValueOnce({ rows: [{ name: 'Tang Alex' }] }) // resolveIssuedBy
      .mockResolvedValueOnce({ rows: [{
        id: 'letter-1', status: 'issued', recipient_type: 'external', pdf_url: null,
        last_edited_by_name: 'Tang Alex',
      }] }); // UPDATE ... RETURNING
    const res = await request(buildApp()).patch('/api/general-letters/letter-1').send(editBody());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('issued');
    expect(res.body.pdf_url).toBeNull();
    expect(res.body.last_edited_by_name).toBe('Tang Alex');
    // recipient_type is external in this edit -> no FK lookup query, no notification (not a teacher recipient)
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('switching to "on_behalf_of_head" moves an already-issued letter back to pending_approval', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'letter-1', status: 'issued', classification: 'internal_administrative', issued_as: 'own_office' }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Tang Alex' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'letter-1', status: 'pending_approval' }] });
    const res = await request(buildApp()).patch('/api/general-letters/letter-1').send(editBody({ issued_as: 'on_behalf_of_head' }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_approval');
  });

  it('re-notifies the (possibly corrected) teacher recipient when the edit leaves the letter issued', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'letter-1', status: 'issued', classification: 'internal_administrative', issued_as: 'own_office' }] })
      .mockResolvedValueOnce({ rows: [{ id: TEACHER_A }] }) // recipient FK check
      .mockResolvedValueOnce({ rows: [{ name: 'Tang Alex' }] }) // resolveIssuedBy
      .mockResolvedValueOnce({ rows: [{
        id: 'letter-1', status: 'issued', recipient_type: 'teacher', internal_recipient_id: TEACHER_A,
        school_id: SCHOOL_A, subject: 'Corrected subject', requires_acceptance: false,
      }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // notification insert
    const res = await request(buildApp()).patch('/api/general-letters/letter-1').send(editBody({
      recipient_type: 'teacher', internal_recipient_id: TEACHER_A, internal_recipient_table: 'teachers', ext_recipient_title: undefined,
    }));
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(5);
  });
});

describe('PATCH /:id/void', () => {
  it('requires a reason', async () => {
    const res = await request(buildApp()).patch('/api/general-letters/letter-1/void').send({});
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('404s when the letter is not in a voidable status (wrong school, already voided, still a draft, etc)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ name: 'Tang Alex' }] }) // resolveIssuedBy
      .mockResolvedValueOnce({ rows: [] }); // UPDATE matched nothing
    const res = await request(buildApp()).patch('/api/general-letters/letter-1/void').send({ reason: 'Issued to the wrong teacher' });
    expect(res.status).toBe(404);
  });

  it('voids an issued letter and records who/why', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ name: 'Tang Alex' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'letter-1', status: 'voided', voided_by_name: 'Tang Alex', void_reason: 'Issued to the wrong teacher' }] });
    const res = await request(buildApp()).patch('/api/general-letters/letter-1/void').send({ reason: 'Issued to the wrong teacher' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('voided');
    expect(res.body.void_reason).toBe('Issued to the wrong teacher');
    expect(mockQuery.mock.calls[1][1]).toEqual(['Tang Alex', 'Issued to the wrong teacher', 'letter-1', SCHOOL_A]);
  });
});
