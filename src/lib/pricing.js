const SELECT_TYPES = ['dropdown', 'buttons', 'swatches', 'radio'];

export function baseUnitPrice(product) {
  return product.sale_price != null && product.sale_price !== ''
    ? Number(product.sale_price)
    : Number(product.price) || 0;
}

export function optionsPrice(product, selections = {}) {
  let total = 0;
  (product.options || []).forEach((opt) => {
    const val = selections[opt.name];
    if (val == null || val === '' || val === false) return;
    if (SELECT_TYPES.includes(opt.type)) {
      const match = (opt.values || []).find((v) => v.label === val);
      if (match) total += Number(match.price_modifier) || 0;
    } else {
      total += Number(opt.values?.[0]?.price_modifier) || 0;
    }
  });
  return total;
}

export function customizationsPrice(product, values = {}) {
  let total = 0;
  (product.customizations || []).forEach((c) => {
    const val = values[c.label];
    if (val == null || val === '' || val === false) return;
    total += Number(c.price) || 0;
  });
  return total;
}

export function unitTotal(product, selections, customs) {
  return baseUnitPrice(product) + optionsPrice(product, selections) + customizationsPrice(product, customs);
}

export function depositForItem(product, lineTotal) {
  const d = product.deposit;
  if (!d?.enabled) return 0;
  const amount = d.type === 'fixed' ? Math.min(Number(d.value) || 0, lineTotal) : (lineTotal * (Number(d.value) || 0)) / 100;
  return Math.round(amount * 100) / 100;
}