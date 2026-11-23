import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { downloadCsvFile, isWebEnvironment } from '../utils/export.ts';

describe('export utilities', () => {
  test('isWebEnvironment correctly identifies Node environment as non-web', () => {
    assert.strictEqual(isWebEnvironment(), false);
  });

  test('downloadCsvFile returns false gracefully in non-web environment without throwing', () => {
    const result = downloadCsvFile('Date,Description,Amount,Category\n2026-11-23,Groceries,-50.00,Food');
    assert.strictEqual(result, false);
  });
});
