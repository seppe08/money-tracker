import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAmount,
  validateCategory,
  validateDescription,
  validateOccurredOn,
} from '../utils/validation.ts';

describe('validateAmount', () => {
  test('rejects empty and whitespace strings', () => {
    assert.deepStrictEqual(validateAmount(''), {
      isValid: false,
      error: 'Amount is required.',
    });
    assert.deepStrictEqual(validateAmount('   '), {
      isValid: false,
      error: 'Amount is required.',
    });
  });

  test('rejects negative numbers or leading signs', () => {
    assert.deepStrictEqual(validateAmount('-25'), {
      isValid: false,
      error: 'Amount must be a positive number.',
    });
    assert.deepStrictEqual(validateAmount('+10'), {
      isValid: false,
      error: 'Amount must be a positive number.',
    });
  });

  test('rejects non-numeric characters', () => {
    assert.deepStrictEqual(validateAmount('abc'), {
      isValid: false,
      error: 'Amount must be a positive number.',
    });
    assert.deepStrictEqual(validateAmount('12.34.56'), {
      isValid: false,
      error: 'Amount must be a positive number.',
    });
  });

  test('rejects numbers with more than 2 decimal places', () => {
    assert.deepStrictEqual(validateAmount('19.999'), {
      isValid: false,
      error: 'Amount must have at most 2 decimal places.',
    });
  });

  test('rejects zero or negative numeric values', () => {
    assert.deepStrictEqual(validateAmount('0'), {
      isValid: false,
      error: 'Amount must be greater than zero.',
    });
    assert.deepStrictEqual(validateAmount('0.00'), {
      isValid: false,
      error: 'Amount must be greater than zero.',
    });
  });

  test('rejects values exceeding max allowed amount', () => {
    assert.deepStrictEqual(validateAmount('10000000000'), {
      isValid: false,
      error: 'Amount is too large.',
    });
  });

  test('normalises integer inputs to two decimals', () => {
    assert.deepStrictEqual(validateAmount('42'), {
      isValid: true,
      cleanValue: '42.00',
    });
  });

  test('normalises single-decimal inputs to two decimals', () => {
    assert.deepStrictEqual(validateAmount('42.5'), {
      isValid: true,
      cleanValue: '42.50',
    });
  });

  test('preserves two-decimal inputs', () => {
    assert.deepStrictEqual(validateAmount('42.75'), {
      isValid: true,
      cleanValue: '42.75',
    });
  });
});

describe('validateDescription', () => {
  test('rejects empty and whitespace strings', () => {
    assert.deepStrictEqual(validateDescription(''), {
      isValid: false,
      error: 'Description is required.',
    });
    assert.deepStrictEqual(validateDescription('   '), {
      isValid: false,
      error: 'Description is required.',
    });
  });

  test('rejects descriptions exceeding 200 characters', () => {
    const longDesc = 'A'.repeat(201);
    assert.deepStrictEqual(validateDescription(longDesc), {
      isValid: false,
      error: 'Description cannot exceed 200 characters.',
    });
  });

  test('accepts and trims valid descriptions', () => {
    assert.deepStrictEqual(validateDescription('  Coffee at Bakery  '), {
      isValid: true,
      cleanValue: 'Coffee at Bakery',
    });
  });
});

describe('validateCategory', () => {
  test('allows empty strings and normalises to null', () => {
    assert.deepStrictEqual(validateCategory(''), {
      isValid: true,
      cleanValue: null,
    });
    assert.deepStrictEqual(validateCategory('   '), {
      isValid: true,
      cleanValue: null,
    });
  });

  test('rejects category names exceeding 50 characters', () => {
    const longCat = 'C'.repeat(51);
    assert.deepStrictEqual(validateCategory(longCat), {
      isValid: false,
      error: 'Category cannot exceed 50 characters.',
    });
  });

  test('accepts and trims valid categories', () => {
    assert.deepStrictEqual(validateCategory('  Groceries  '), {
      isValid: true,
      cleanValue: 'Groceries',
    });
  });
});

describe('validateOccurredOn', () => {
  test('rejects empty strings', () => {
    assert.deepStrictEqual(validateOccurredOn(''), {
      isValid: false,
      error: 'Date is required.',
    });
  });

  test('rejects malformed date formats', () => {
    assert.deepStrictEqual(validateOccurredOn('11-23-2026'), {
      isValid: false,
      error: 'Date must be in YYYY-MM-DD format.',
    });
    assert.deepStrictEqual(validateOccurredOn('2026/11/23'), {
      isValid: false,
      error: 'Date must be in YYYY-MM-DD format.',
    });
  });

  test('rejects invalid months', () => {
    assert.deepStrictEqual(validateOccurredOn('2026-00-15'), {
      isValid: false,
      error: 'Month must be between 01 and 12.',
    });
    assert.deepStrictEqual(validateOccurredOn('2026-13-01'), {
      isValid: false,
      error: 'Month must be between 01 and 12.',
    });
  });

  test('rejects invalid days of month', () => {
    assert.deepStrictEqual(validateOccurredOn('2026-04-31'), {
      isValid: false,
      error: 'Date must be a valid calendar date.',
    });
    assert.deepStrictEqual(validateOccurredOn('2026-02-30'), {
      isValid: false,
      error: 'Date must be a valid calendar date.',
    });
  });

  test('correctly validates leap years', () => {
    // 2024 was a leap year
    assert.deepStrictEqual(validateOccurredOn('2024-02-29'), {
      isValid: true,
      cleanValue: '2024-02-29',
    });
    // 2025 was not a leap year
    assert.deepStrictEqual(validateOccurredOn('2025-02-29'), {
      isValid: false,
      error: 'Date must be a valid calendar date.',
    });
  });

  test('accepts valid dates', () => {
    assert.deepStrictEqual(validateOccurredOn('2026-11-23'), {
      isValid: true,
      cleanValue: '2026-11-23',
    });
  });
});
