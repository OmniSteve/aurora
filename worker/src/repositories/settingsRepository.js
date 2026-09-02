import { centsToAmount } from '../lib/money.js';

// Public-facing settings only. email/phone/address/instagram/facebook/tiktok/
// stripe_enabled/stripe_test_mode are deliberately withheld -- nothing in the
// current UI reads them from this endpoint (the footer is hard-coded per
// migration/HANDOVER.md), and there is no reason to expose business contact
// details or internal flags on a public route. Base44's original
// implementation returned the entire record; this is a deliberate narrowing.
export function createSettingsRepository(db) {
  return {
    async getPublic() {
      const [settings, shippingMethods] = await Promise.all([
        db.prepare(`SELECT * FROM store_settings WHERE id = 1`).first(),
        db
          .prepare(`SELECT name, price_cents, estimate, free_over_cents FROM shipping_methods ORDER BY sort_order ASC`)
          .all(),
      ]);

      if (!settings) {
        // Singleton row not seeded yet (Phase 5 imports it) -- sane
        // storefront defaults so checkout-adjacent UI doesn't have to
        // null-check every field.
        return {
          store_name: 'Aurora',
          currency: 'GBP',
          currency_symbol: '£',
          tax_rate: 20,
          prices_include_tax: true,
          shipping_methods: [],
        };
      }

      return {
        store_name: settings.store_name,
        currency: settings.currency,
        currency_symbol: settings.currency_symbol,
        tax_rate: settings.tax_rate,
        prices_include_tax: !!settings.prices_include_tax,
        shipping_methods: shippingMethods.results.map((m) => ({
          name: m.name,
          price: centsToAmount(m.price_cents),
          estimate: m.estimate,
          free_over: m.free_over_cents == null ? null : centsToAmount(m.free_over_cents),
        })),
      };
    },
  };
}
