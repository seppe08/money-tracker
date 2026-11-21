const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatDate(isoDate: string): string {
  // Parse the date part only so the displayed day does not shift by timezone.
  return dateFormatter.format(new Date(`${isoDate.slice(0, 10)}T00:00:00`));
}
