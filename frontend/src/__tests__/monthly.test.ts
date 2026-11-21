import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

function getMonthRange(year: number, month: number) {
  // month is 0-indexed (0 = Jan, 11 = Dec)
  const lastDay = new Date(year, month + 1, 0).getDate();
  const mStr = String(month + 1).padStart(2, '0');
  const lastDayStr = String(lastDay).padStart(2, '0');
  return {
    from_date: `${year}-${mStr}-01`,
    to_date: `${year}-${mStr}-${lastDayStr}`,
    daysInMonth: lastDay,
  };
}

describe('Monthly View Date Calculations', () => {
  test('calculates correct range for 31-day month (e.g., January)', () => {
    const range = getMonthRange(2026, 0); // January 2026
    assert.strictEqual(range.from_date, '2026-01-01');
    assert.strictEqual(range.to_date, '2026-01-31');
    assert.strictEqual(range.daysInMonth, 31);
  });

  test('calculates correct range for 30-day month (e.g., November)', () => {
    const range = getMonthRange(2026, 10); // November 2026
    assert.strictEqual(range.from_date, '2026-11-01');
    assert.strictEqual(range.to_date, '2026-11-30');
    assert.strictEqual(range.daysInMonth, 30);
  });

  test('calculates 28 days for February in a non-leap year (2025)', () => {
    const range = getMonthRange(2025, 1); // February 2025
    assert.strictEqual(range.from_date, '2025-02-01');
    assert.strictEqual(range.to_date, '2025-02-28');
    assert.strictEqual(range.daysInMonth, 28);
  });

  test('calculates 29 days for February in a leap year (2024)', () => {
    const range = getMonthRange(2024, 1); // February 2024
    assert.strictEqual(range.from_date, '2024-02-01');
    assert.strictEqual(range.to_date, '2024-02-29');
    assert.strictEqual(range.daysInMonth, 29);
  });

  test('calculates correct range across year boundaries (December to January)', () => {
    const dec = getMonthRange(2025, 11); // December 2025
    assert.strictEqual(dec.from_date, '2025-12-01');
    assert.strictEqual(dec.to_date, '2025-12-31');

    const jan = getMonthRange(2026, 0); // January 2026
    assert.strictEqual(jan.from_date, '2026-01-01');
    assert.strictEqual(jan.to_date, '2026-01-31');
  });
});
