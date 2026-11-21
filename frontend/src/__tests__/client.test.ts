import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { ApiError, buildQueryString, errorMessage } from '../api/errors.ts';

describe('ApiError', () => {
  test('creates an instance with status and message', () => {
    const error = new ApiError(404, 'Transaction not found.');
    assert.strictEqual(error.status, 404);
    assert.strictEqual(error.message, 'Transaction not found.');
    assert.strictEqual(error.name, 'ApiError');
  });

  test('records retry-after seconds for 429 errors', () => {
    const error = new ApiError(429, 'Rate limit exceeded.', { retryAfterSeconds: 15 });
    assert.strictEqual(error.status, 429);
    assert.strictEqual(error.retryAfterSeconds, 15);
  });
});

describe('errorMessage', () => {
  test('formats 429 rate limit with seconds', () => {
    const error = new ApiError(429, 'Too many requests.', { retryAfterSeconds: 30 });
    const msg = errorMessage(error);
    assert.strictEqual(msg, 'Too many requests. Try again in 30s.');
  });

  test('returns standard message from ApiError', () => {
    const error = new ApiError(400, 'Invalid currency code.');
    const msg = errorMessage(error);
    assert.strictEqual(msg, 'Invalid currency code.');
  });

  test('extracts message from standard Error', () => {
    const error = new Error('Network timeout');
    const msg = errorMessage(error);
    assert.strictEqual(msg, 'Network timeout');
  });

  test('handles unknown errors gracefully', () => {
    assert.strictEqual(errorMessage(null), 'Something went wrong. Please try again.');
    assert.strictEqual(errorMessage(undefined), 'Something went wrong. Please try again.');
    assert.strictEqual(errorMessage(123), 'Something went wrong. Please try again.');
  });
});

describe('buildQueryString', () => {
  test('serializes query parameters correctly', () => {
    const qs = buildQueryString({
      limit: 10,
      search: 'coffee',
      category: undefined,
    });
    assert.ok(qs.includes('limit=10'));
    assert.ok(qs.includes('search=coffee'));
    assert.ok(!qs.includes('category'));
  });
});
