// Money is stored in D1 as integer pence and exposed over the API as GBP
// decimal numbers, matching what the frontend (src/lib/pricing.js) expects.

export function centsToAmount(cents) {
  return cents == null ? null : Math.round(cents) / 100;
}

export function amountToCents(amount) {
  return Math.round(Number(amount) * 100);
}
