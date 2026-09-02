import { centsToAmount } from '../lib/money.js';

// Read-only, public-surface repository for Phase 3. Admin methods
// (create/update/remove/listAll/get-by-id) are intentionally not implemented
// here yet -- their routes 401 via requireAdminStub() before ever reaching a
// repository, so there is nothing for them to call.
export function createProductsRepository(db) {
  return {
    async listPublished({ limit = 200 } = {}) {
      const { results } = await db
        .prepare(`SELECT * FROM products WHERE status = 'published' ORDER BY created_at DESC LIMIT ?`)
        .bind(limit)
        .all();
      return Promise.all(results.map((row) => hydrate(db, row)));
    },

    // Publication status is filtered in SQL, not in application code --
    // a draft/archived product is invisible to this query regardless of
    // whether the caller already knows its slug (migration/HANDOVER.md #8).
    async getPublishedBySlug(slug) {
      const row = await db
        .prepare(`SELECT * FROM products WHERE slug = ? AND status = 'published' LIMIT 1`)
        .bind(slug)
        .first();
      return row ? hydrate(db, row) : null;
    },
  };
}

async function hydrate(db, row) {
  const [images, materials, options, customizations, collectionRows, specialRequest, deposit] = await Promise.all([
    db.prepare(`SELECT url, alt, featured FROM product_images WHERE product_id = ? ORDER BY sort_order`).bind(row.id).all(),
    db.prepare(`SELECT material FROM product_materials WHERE product_id = ? ORDER BY sort_order`).bind(row.id).all(),
    db.prepare(`SELECT id, name, type, required FROM product_options WHERE product_id = ? ORDER BY sort_order`).bind(row.id).all(),
    db
      .prepare(`SELECT label, type, price_cents, options_json, placeholder, max_length FROM product_customizations WHERE product_id = ? ORDER BY sort_order`)
      .bind(row.id)
      .all(),
    db.prepare(`SELECT collection_id FROM product_collections WHERE product_id = ?`).bind(row.id).all(),
    db.prepare(`SELECT * FROM product_special_request WHERE product_id = ?`).bind(row.id).first(),
    db.prepare(`SELECT * FROM product_deposit WHERE product_id = ?`).bind(row.id).first(),
  ]);

  const optionsWithValues = await Promise.all(
    options.results.map(async (opt) => {
      const { results: values } = await db
        .prepare(`SELECT label, price_modifier_cents, sku_suffix, swatch, available, lead_time FROM product_option_values WHERE option_id = ? ORDER BY sort_order`)
        .bind(opt.id)
        .all();
      return {
        name: opt.name,
        type: opt.type,
        required: !!opt.required,
        values: values.map((v) => ({
          label: v.label,
          price_modifier: centsToAmount(v.price_modifier_cents),
          sku_suffix: v.sku_suffix,
          swatch: v.swatch,
          available: v.available == null ? null : !!v.available,
          lead_time: v.lead_time,
        })),
      };
    }),
  );

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    short_description: row.short_description,
    description: row.description,
    price: centsToAmount(row.price_cents),
    sale_price: row.sale_price_cents == null ? null : centsToAmount(row.sale_price_cents),
    category_id: row.category_id,
    collection_ids: collectionRows.results.map((r) => r.collection_id),
    images: images.results.map((img) => ({ url: img.url, alt: img.alt, featured: !!img.featured })),
    materials: materials.results.map((m) => m.material),
    availability: row.availability,
    stock_quantity: row.stock_quantity,
    lead_time: row.lead_time,
    options: optionsWithValues,
    customizations: customizations.results.map((c) => ({
      label: c.label,
      type: c.type,
      price: centsToAmount(c.price_cents),
      options: c.options_json ? JSON.parse(c.options_json) : [],
      placeholder: c.placeholder,
      max_length: c.max_length,
    })),
    special_request: specialRequest
      ? {
          enabled: !!specialRequest.enabled,
          message: specialRequest.message,
          allow_images: !!specialRequest.allow_images,
          max_images: specialRequest.max_images,
          payment_behaviour: specialRequest.payment_behaviour,
        }
      : null,
    deposit: deposit
      ? {
          enabled: !!deposit.enabled,
          type: deposit.type,
          value: deposit.type === 'fixed' ? centsToAmount(deposit.value) : deposit.value,
        }
      : null,
    care_info: row.care_info,
    shipping_info: row.shipping_info,
    seo: { title: row.seo_title, description: row.seo_description, og_image: row.seo_og_image },
    status: row.status,
    featured: !!row.featured,
    new_arrival: !!row.new_arrival,
    created_date: row.created_at,
    updated_date: row.updated_at,
  };
}
