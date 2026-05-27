// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { retryTransport, TRANSPORT_BACKOFFS_MS } from './retry.js';

test('retryTransport returns immediately on success', async () => {
  let calls = 0;
  const result = await retryTransport(() => { calls++; return Promise.resolve('ok'); }, { sleep: async () => {} });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('retryTransport retries transport errors and eventually succeeds', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const result = await retryTransport(
    () => {
      calls++;
      if (calls < 3) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve('ok');
    },
    { sleep: async (ms) => { sleeps.push(ms); } },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [250, 500]);
});

test('retryTransport gives up after all backoffs exhausted', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  await assert.rejects(
    () => retryTransport(
      () => { calls++; return Promise.reject(new TypeError('Failed to fetch')); },
      { sleep: async (ms) => { sleeps.push(ms); } },
    ),
    (e: unknown) => (e as Error).message === 'Failed to fetch',
  );
  assert.equal(calls, TRANSPORT_BACKOFFS_MS.length + 1);
  assert.deepEqual(sleeps, [...TRANSPORT_BACKOFFS_MS]);
});

test('retryTransport propagates logic errors immediately', async () => {
  let calls = 0;
  const apiError = Object.assign(new Error('Unknown action'), { code: 'ACTION_NOT_FOUND', status: 404 });
  await assert.rejects(
    () => retryTransport(() => { calls++; return Promise.reject(apiError); }, { sleep: async () => {} }),
    (e: unknown) => (e as { code: string }).code === 'ACTION_NOT_FOUND',
  );
  assert.equal(calls, 1);
});

test('retryTransport reports each attempt via onAttempt', async () => {
  const attempts: number[] = [];
  let calls = 0;
  await retryTransport(
    () => { calls++; if (calls < 2) return Promise.reject(new TypeError('Failed to fetch')); return Promise.resolve('ok'); },
    { sleep: async () => {}, onAttempt: n => attempts.push(n) },
  );
  assert.deepEqual(attempts, [1, 2]);
});
