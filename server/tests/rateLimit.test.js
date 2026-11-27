import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/evp_ratelimit_test';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.API_RATE_LIMIT_MAX = '3';
const { default: app } = await import('../src/app.js');

test('the global API limit answers with a JSON message once it is exceeded', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await request(app).get('/api/health')).status, 200);
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 429);
  assert.match(res.headers['content-type'], /json/);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /Too many requests/);
});
