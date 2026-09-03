import { centsToAmount, amountToCents } from '../lib/money.js';

// Public-facing settings only. phone/address/stripe_enabled/stripe_test_mode
// are deliberately withheld -- internal/contact details not meant for
// public display (address in particular: instruction was explicit that it
// must not be shown publicly). email/instagram/facebook/tiktok ARE public
// by nature (a storefront's own footer contact/social links, editable in
// AdminSettings.jsx) and are included below, each gated by its own
// {platform}_enabled toggle so an admin can hide a platform they don't use
// (e.g. TikTok) without losing the saved URL. Base44's original
// implementation returned the entire record; this is a deliberate
// narrowing.
// A social link is visible when it has a URL AND its toggle isn't off --
// covers both the "never set one" and "set one, then hid it" cases.
function visibleSocial(url, enabledFlag) {
  return url && enabledFlag !== 0 ? url : null;
}

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
          email: null,
          currency: 'GBP',
          currency_symbol: '£',
          tax_rate: 20,
          prices_include_tax: true,
          instagram: null,
          facebook: null,
          tiktok: null,
          shipping_methods: [],
        };
      }

      return {
        store_name: settings.store_name,
        email: settings.email,
        currency: settings.currency,
        currency_symbol: settings.currency_symbol,
        tax_rate: settings.tax_rate,
        prices_include_tax: !!settings.prices_include_tax,
        instagram: visibleSocial(settings.instagram, settings.instagram_enabled),
        facebook: visibleSocial(settings.facebook, settings.facebook_enabled),
        tiktok: visibleSocial(settings.tiktok, settings.tiktok_enabled),
        shipping_methods: shippingMethods.results.map((m) => ({
          name: m.name,
          price: centsToAmount(m.price_cents),
          estimate: m.estimate,
          free_over: m.free_over_cents == null ? null : centsToAmount(m.free_over_cents),
        })),
      };
    },

    // Full record, admin-only -- the one place email/phone/address/social/
    // stripe flags are exposed (deliberately withheld from getPublic()).
    async getAdmin() {
      const [settings, shippingMethods] = await Promise.all([
        db.prepare(`SELECT * FROM store_settings WHERE id = 1`).first(),
        db.prepare(`SELECT * FROM shipping_methods ORDER BY sort_order ASC`).all(),
      ]);
      if (!settings) return null;
      return {
        store_name: settings.store_name,
        email: settings.email,
        phone: settings.phone,
        address: settings.address,
        currency: settings.currency,
        currency_symbol: settings.currency_symbol,
        tax_rate: settings.tax_rate,
        prices_include_tax: !!settings.prices_include_tax,
        instagram: settings.instagram,
        facebook: settings.facebook,
        tiktok: settings.tiktok,
        instagram_enabled: !!settings.instagram_enabled,
        facebook_enabled: !!settings.facebook_enabled,
        tiktok_enabled: !!settings.tiktok_enabled,
        shipping_methods: shippingMethods.results.map((m) => ({
          name: m.name,
          price: centsToAmount(m.price_cents),
          estimate: m.estimate,
          free_over: m.free_over_cents == null ? null : centsToAmount(m.free_over_cents),
        })),
        stripe_enabled: !!settings.stripe_enabled,
        stripe_test_mode: !!settings.stripe_test_mode,
      };
    },

    // Upserts the id=1 singleton and wholesale-replaces shipping_methods --
    // matches AdminSettings.jsx, which always submits the full methods
    // array (add/edit/remove all happen client-side against one array,
    // never as individual per-method operations), so replacement is
    // simpler and equally correct here too.
    async save(data) {
      await db
        .prepare(
          `INSERT INTO store_settings (id, store_name, email, phone, address, currency, currency_symbol, tax_rate, prices_include_tax, instagram, facebook, tiktok, instagram_enabled, facebook_enabled, tiktok_enabled, stripe_enabled, stripe_test_mode)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             store_name = excluded.store_name, email = excluded.email, phone = excluded.phone, address = excluded.address,
             currency = excluded.currency, currency_symbol = excluded.currency_symbol, tax_rate = excluded.tax_rate,
             prices_include_tax = excluded.prices_include_tax, instagram = excluded.instagram, facebook = excluded.facebook,
             tiktok = excluded.tiktok, instagram_enabled = excluded.instagram_enabled, facebook_enabled = excluded.facebook_enabled,
             tiktok_enabled = excluded.tiktok_enabled, stripe_enabled = excluded.stripe_enabled, stripe_test_mode = excluded.stripe_test_mode,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
        )
        .bind(
          data.store_name || 'Aurora', data.email ?? null, data.phone ?? null, data.address ?? null,
          data.currency || 'GBP', data.currency_symbol || '£', Number(data.tax_rate) || 0, data.prices_include_tax === false ? 0 : 1,
          data.instagram ?? null, data.facebook ?? null, data.tiktok ?? null,
          data.instagram_enabled === false ? 0 : 1, data.facebook_enabled === false ? 0 : 1, data.tiktok_enabled === false ? 0 : 1,
          data.stripe_enabled ? 1 : 0, data.stripe_test_mode === false ? 0 : 1,
        )
        .run();

      const methods = data.shipping_methods || [];
      await db.batch([
        db.prepare(`DELETE FROM shipping_methods`),
        ...methods.map((m, i) =>
          db
            .prepare(`INSERT INTO shipping_methods (id, name, price_cents, estimate, free_over_cents, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), m.name, amountToCents(m.price || 0), m.estimate ?? null, m.free_over == null || m.free_over === '' ? null : amountToCents(m.free_over), i),
        ),
      ]);

      return this.getAdmin();
    },

    // Cents-native, for the authoritative checkout pricing path.
    async getForPricing() {
      const [settings, shippingMethods] = await Promise.all([
        db.prepare(`SELECT * FROM store_settings WHERE id = 1`).first(),
        db.prepare(`SELECT name, price_cents, free_over_cents FROM shipping_methods ORDER BY sort_order ASC`).all(),
      ]);

      return {
        currency: settings?.currency || 'GBP',
        taxRatePercent: settings?.tax_rate ?? 20,
        pricesIncludeTax: settings ? !!settings.prices_include_tax : true,
        shippingMethods: shippingMethods.results.map((m) => ({
          name: m.name,
          priceCents: m.price_cents,
          freeOverCents: m.free_over_cents,
        })),
      };
    },
  };
}
