export const PRESET_CATEGORIES: string[] = [
  'Food & Dining',
  'Groceries',
  'Transportation',
  'Housing & Utilities',
  'Entertainment',
  'Shopping',
  'Healthcare',
  'Salary',
  'Investment',
];

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validateAmount(rawAmount: string): {
  isValid: boolean;
  error?: string;
  cleanValue?: string;
} {
  const trimmed = rawAmount.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Amount is required.' };
  }

  // Must be a positive decimal number without signs (signs handled by segmented toggle)
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { isValid: false, error: 'Amount must be a positive number.' };
  }

  const parts = trimmed.split('.');
  if (parts.length === 2 && parts[1].length > 2) {
    return {
      isValid: false,
      error: 'Amount must have at most 2 decimal places.',
    };
  }

  const numericValue = parseFloat(trimmed);
  if (isNaN(numericValue) || numericValue <= 0) {
    return { isValid: false, error: 'Amount must be greater than zero.' };
  }

  if (numericValue > 9999999999.99) {
    return { isValid: false, error: 'Amount is too large.' };
  }

  const cleanValue =
    parts.length === 2 && parts[1].length === 1
      ? `${parts[0]}.${parts[1]}0`
      : parts.length === 1
        ? `${parts[0]}.00`
        : trimmed;

  return { isValid: true, cleanValue };
}

export function validateDescription(rawDesc: string): {
  isValid: boolean;
  error?: string;
  cleanValue?: string;
} {
  const trimmed = rawDesc.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Description is required.' };
  }
  if (trimmed.length > 200) {
    return {
      isValid: false,
      error: 'Description cannot exceed 200 characters.',
    };
  }
  return { isValid: true, cleanValue: trimmed };
}

export function validateCategory(rawCat: string): {
  isValid: boolean;
  error?: string;
  cleanValue?: string | null;
} {
  const trimmed = rawCat.trim();
  if (!trimmed) {
    return { isValid: true, cleanValue: null };
  }
  if (trimmed.length > 50) {
    return { isValid: false, error: 'Category cannot exceed 50 characters.' };
  }
  return { isValid: true, cleanValue: trimmed };
}

export function validateOccurredOn(rawDate: string): {
  isValid: boolean;
  error?: string;
  cleanValue?: string;
} {
  const trimmed = rawDate.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Date is required.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { isValid: false, error: 'Date must be in YYYY-MM-DD format.' };
  }
  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) {
    return { isValid: false, error: 'Month must be between 01 and 12.' };
  }
  if (day < 1 || day > 31) {
    return { isValid: false, error: 'Day must be between 01 and 31.' };
  }

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  if (
    dateObj.getUTCFullYear() !== year ||
    dateObj.getUTCMonth() + 1 !== month ||
    dateObj.getUTCDate() !== day
  ) {
    return { isValid: false, error: 'Date must be a valid calendar date.' };
  }

  return { isValid: true, cleanValue: trimmed };
}
