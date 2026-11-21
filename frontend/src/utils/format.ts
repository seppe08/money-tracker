const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function getCurrencyFormatter(currency: string = 'USD'): Intl.NumberFormat {
  const code = (currency || 'USD').trim().toUpperCase();
  let formatter = currencyFormatters.get(code);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
      });
    } catch {
      formatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
      });
    }
    currencyFormatters.set(code, formatter);
  }
  return formatter;
}

export function formatCurrency(value: number, currency: string = 'USD'): string {
  return getCurrencyFormatter(currency).format(value);
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export function formatDate(isoDate: string): string {
  // Parse the date part only so the displayed day does not shift by timezone.
  return dateFormatter.format(new Date(`${isoDate.slice(0, 10)}T00:00:00`));
}

const monthYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
});

export function formatMonthYear(date: Date): string {
  return monthYearFormatter.format(date);
}
