'use strict';

const request = require('supertest');
const express = require('express');

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();

jest.mock('../config/db', () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn().mockResolvedValue({
    query: (...args) => mockClientQuery(...args),
    release: (...args) => mockRelease(...args),
  }),
}));

const publicWaecRouter = require('../routes/public-waec-results');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/public/waec-results', publicWaecRouter);
  return app;
}

const SIMPLE_LISTING = `
INDEX NUMBERNAMEGENDERDOBRESULTS
0100505001
TEST CANDIDATE
Female01/01/2005
MATHEMATICS(CORE) - C6 ,
ENGLISH LANG - F9
Total Number of Candidates: 1
`;

describe('Public WAEC Results route', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockRelease.mockReset();
  });

  it('creates a paid public analysis record and returns a report', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'analysis-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'analysis-1' }] });

    const res = await request(buildApp())
      .post('/api/public/waec-results/checkout')
      .send({ amount: 20, payment_reference: 'REF-123', raw_text: SIMPLE_LISTING });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.paid).toBe(true);
    expect(res.body.report.totalCandidates).toBe(1);
  });

  it('blocks unpaid analysis from report access', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp())
      .get('/api/public/waec-results/not-found/report');

    expect(res.status).toBe(404);
  });
});
