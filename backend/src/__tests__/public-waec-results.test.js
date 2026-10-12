'use strict';

const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

process.env.PAYSTACK_SECRET_KEY = 'sk_test_fixture';

const mockQuery = jest.fn();

jest.mock('../config/db', () => ({
  query: (...args) => mockQuery(...args),
}));

const { router: publicWaecRouter, webhookHandler } = require('../routes/public-waec-results');

function buildApp() {
  const app = express();
  app.post('/api/public/waec-results/webhook', express.raw({ type: 'application/json' }), webhookHandler);
  app.use(express.json());
  app.use('/api/public/waec-results', publicWaecRouter);
  return app;
}

function signedWebhookBody(payload) {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(Buffer.from(raw)).digest('hex');
  return { raw, signature };
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
    global.fetch = jest.fn();
  });

  describe('POST /initialize', () => {
    it('creates a pending record and returns a Paystack authorization_url', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'row-1' }] });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: true, data: { authorization_url: 'https://checkout.paystack.com/abc' } }),
      });

      const res = await request(buildApp())
        .post('/api/public/waec-results/initialize')
        .send({ contact_name: 'Ama Owusu', contact_email: 'ama@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('row-1');
      expect(res.body.authorization_url).toBe('https://checkout.paystack.com/abc');
    });

    it('rejects a missing email', async () => {
      const res = await request(buildApp())
        .post('/api/public/waec-results/initialize')
        .send({ contact_name: 'Ama Owusu' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /webhook', () => {
    it('rejects a request with a bad signature', async () => {
      const { raw } = signedWebhookBody({ event: 'charge.success', data: { reference: 'pub-waec-1' } });

      const res = await request(buildApp())
        .post('/api/public/waec-results/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', 'not-the-real-signature')
        .send(raw);

      expect(res.status).toBe(401);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('marks a matching reference paid on a valid charge.success event', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { raw, signature } = signedWebhookBody({ event: 'charge.success', data: { reference: 'pub-waec-1' } });

      const res = await request(buildApp())
        .post('/api/public/waec-results/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(raw);

      expect(res.status).toBe(200);
      await new Promise((resolve) => setImmediate(resolve)); // webhook acks before its async DB update settles
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'paid'"),
        ['pub-waec-1']
      );
    });
  });

  describe('POST /:id/generate', () => {
    it('refuses to generate a report before payment is confirmed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ status: 'pending' }] }); // status lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ paystack_reference: 'pub-waec-1', status: 'pending' }] }); // verifyWithPaystack lookup
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'pending' } }) });

      const res = await request(buildApp())
        .post('/api/public/waec-results/row-1/generate')
        .send({ raw_text: SIMPLE_LISTING });

      expect(res.status).toBe(402);
    });

    it('generates a report once a payment is paid, and blocks a second attempt', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ status: 'paid' }] }); // status lookup
      mockQuery.mockResolvedValueOnce({ rows: [{}] }); // UPDATE ... SET status = 'completed'

      const res = await request(buildApp())
        .post('/api/public/waec-results/row-1/generate')
        .send({ raw_text: SIMPLE_LISTING });

      expect(res.status).toBe(200);
      expect(res.body.report.totalCandidates).toBe(1);

      mockQuery.mockResolvedValueOnce({ rows: [{ status: 'completed' }] }); // status lookup
      const second = await request(buildApp())
        .post('/api/public/waec-results/row-1/generate')
        .send({ raw_text: SIMPLE_LISTING });

      expect(second.status).toBe(409);
    });
  });

  describe('GET /:id/report', () => {
    it('404s until the report is completed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'row-1', status: 'paid', report: null }] });

      const res = await request(buildApp()).get('/api/public/waec-results/row-1/report');

      expect(res.status).toBe(404);
    });
  });
});
