export function formatPrice(amount, symbol = '£') {
  const n = Number(amount) || 0;
  return `${symbol}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const slugify = (s) =>
  (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');