import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatCurrency,
  formatDate,
  formatMonthYear,
  getCurrencyFormatter,
} from '../utils/format.ts';

describe('formatCurrency', () => {
  test('formats USD by default', () => {
    const formatted = formatCurrency(123.45);
    assert.match(formatted, /\$123\.45/);
  });

  test('formats with specified currency from user/auth context', () => {
    const eur = formatCurrency(123.45, 'EUR');
    assert.match(eur, /€|EUR/);

    const gbp = formatCurrency(50, 'GBP');
    assert.match(gbp, /£|GBP/);

    const jpy = formatCurrency(1000, 'JPY');
    assert.match(jpy, /¥|JPY/);
  });

  test('handles zero and negative amounts', () => {
    const zero = formatCurrency(0, 'USD');
    assert.match(zero, /\$0\.00/);

    const negative = formatCurrency(-45.67, 'USD');
    assert.match(negative, /-\$45\.67|\(\$45\.67\)/);
  });

  test('falls back gracefully on unknown or malformed currency codes', () => {
    const fallback = formatCurrency(99.99, 'INVALID_XYZ');
    assert.ok(typeof fallback === 'string' && fallback.length > 0);
  });

  test('reuses cached formatter instances for performance', () => {
    const fmt1 = getCurrencyFormatter('EUR');
    const fmt2 = getCurrencyFormatter('EUR');
    assert.strictEqual(fmt1, fmt2);
  });
});

describe('formatDate', () => {
  test('formats ISO date without shifting across timezones', () => {
    const formatted = formatDate('2026-11-22T14:30:00Z');
    assert.match(formatted, /Nov 22/);
  });

  test('formats YYYY-MM-DD string correctly', () => {
    const formatted = formatDate('2026-01-05');
    assert.match(formatted, /Jan 5/);
  });
});

describe('formatMonthYear', () => {
  test('formats Date object into Month Year', () => {
    const d = new Date(2026, 10, 1); // November 2026 (0-indexed month 10 = Nov)
    const formatted = formatMonthYear(d);
    assert.strictEqual(formatted, 'November 2026');
  });
});
