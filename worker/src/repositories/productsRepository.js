import { centsToAmount, amountToCents } from '../lib/money.js';
import { ValidationError } from '../lib/http.js';

export function createProductsRepository(db) {
  return {
    async listAllAdmin() {
      const { results } = await db.prepare(`SELECT * FROM products ORDER BY updated_at DESC LIMIT 500`).all();
      return Promise.all(results.map((row) => hydrate(db, row)));
    },

    async getByIdAdmin(id) {
      const row = await db.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first();
      return row ? hydrate(db, row) : null;
    },

    // Transactional create: the product row and every normalised child
    // table are written in one db.batch() call, so a failure partway
    // through (e.g. a duplicate slug) leaves nothing behind -- there is no
    // separate "insert product, then insert children" step that could
    // succeed/fail independently (instruction #2).
    async create(data) {
      const id = crypto.randomUUID();
      const stmts = [buildProductInsertStatement(db, id, data), ...buildChildInsertStatements(db, id, data)];
      await runProductBatch(db, stmts);
      return this.getByIdAdmin(id);
    },

    // Same atomicity guarantee as create(): one batch containing the
    // product UPDATE, a DELETE of every child row, and a fresh INSERT of
    // the submitted child rows. Delete-then-reinsert (rather than diffing)
    // is deliberate -- the admin editor always submits the full nested
    // shape, so replacement is simpler and equally correct, and it's what
    // makes "a failed nested update cannot leave a partially-updated
    // product" true: either the whole batch lands, or none of it does.
    async update(id, data) {
      const stmts = [
        buildProductUpdateStatement(db, id, data),
        ...buildChildDeleteStatements(db, id),
        ...buildChildInsertStatements(db, id, data),
      ];
      await runProductBatch(db, stmts);
      return this.getByIdAdmin(id);
    },

    // Hard delete is refused (not silently downgraded to archive) once a
    // product has real order history -- order_items.product_id would be
    // left dangling, and more importantly that history must never quietly
    // disappear. The admin UI's existing "Archive" status change is the
    // right tool for a product that should stop being sold.
    async remove(id) {
      const used = await db.prepare(`SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1`).bind(id).first();
      if (used) throw new ValidationError('This product has order history and cannot be deleted. Archive it instead.');
      await db.batch([...buildChildDeleteStatements(db, id), db.prepare(`DELETE FROM products WHERE id = ?`).bind(id)]);
    },
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

    // Cents-native, for the authoritative checkout pricing path only --
    // never exposed over the public JSON API (that's hydrate(), which
    // converts to pounds for display). Same 'published' gate as the public
    // routes: an order can't be placed against a draft/archived product
    // any more than one can be viewed.
    async getForPricing(id) {
      const row = await db.prepare(`SELECT * FROM products WHERE id = ? AND status = 'published' LIMIT 1`).bind(id).first();
      return row ? hydrateForPricing(db, row) : null;
    },
  };
}

async function hydrateForPricing(db, row) {
  const [options, customizations, specialRequest, deposit, featuredImage] = await Promise.all([
    db.prepare(`SELECT id, name, type, required FROM product_options WHERE product_id = ? ORDER BY sort_order`).bind(row.id).all(),
    db
      .prepare(`SELECT label, type, price_cents, max_length FROM product_customizations WHERE product_id = ? ORDER BY sort_order`)
      .bind(row.id)
      .all(),
    db.prepare(`SELECT * FROM product_special_request WHERE product_id = ?`).bind(row.id).first(),
    db.prepare(`SELECT * FROM product_deposit WHERE product_id = ?`).bind(row.id).first(),
    db
      .prepare(`SELECT url FROM product_images WHERE product_id = ? ORDER BY featured DESC, sort_order LIMIT 1`)
      .bind(row.id)
      .first(),
  ]);

  const optionsWithValues = await Promise.all(
    options.results.map(async (opt) => {
      const { results: values } = await db
        .prepare(`SELECT label, price_modifier_cents, available FROM product_option_values WHERE option_id = ? ORDER BY sort_order`)
        .bind(opt.id)
        .all();
      return {
        name: opt.name,
        type: opt.type,
        required: !!opt.required,
        values: values.map((v) => ({ label: v.label, priceModifierCents: v.price_modifier_cents, available: !!v.available })),
      };
    }),
  );

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    imageUrl: featuredImage?.url ?? null,
    priceCents: row.price_cents,
    salePriceCents: row.sale_price_cents,
    availability: row.availability,
    stockQuantity: row.stock_quantity,
    reservedQuantity: row.reserved_quantity,
    options: optionsWithValues,
    customizations: customizations.results.map((c) => ({ label: c.label, type: c.type, priceCents: c.price_cents, maxLength: c.max_length })),
    specialRequest: specialRequest
      ? {
          enabled: !!specialRequest.enabled,
          allowImages: !!specialRequest.allow_images,
          maxImages: specialRequest.max_images,
          paymentBehaviour: specialRequest.payment_behaviour,
        }
      : null,
    deposit: deposit ? { enabled: !!deposit.enabled, type: deposit.type, value: deposit.value } : null,
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

async function runProductBatch(db, stmts) {
  try {
    await db.batch(stmts);
  } catch (err) {
    if (String(err.message || err).includes('UNIQUE')) {
      throw new ValidationError('This URL slug is already in use by another product.');
    }
    throw err;
  }
}

const PRODUCT_COLUMNS = `name, slug, sku, short_description, description, price_cents, sale_price_cents, category_id, availability, stock_quantity, lead_time, care_info, shipping_info, seo_title, seo_description, seo_og_image, status, featured, new_arrival`;

function productBindValues(data) {
  return [
    data.name,
    data.slug,
    data.sku ?? null,
    data.short_description ?? null,
    data.description ?? null,
    amountToCents(data.price || 0),
    data.sale_price == null || data.sale_price === '' ? null : amountToCents(data.sale_price),
    data.category_id || null,
    data.availability || 'in_stock',
    data.stock_quantity === '' || data.stock_quantity == null ? null : Number(data.stock_quantity),
    data.lead_time ?? null,
    data.care_info ?? null,
    data.shipping_info ?? null,
    data.seo?.title ?? null,
    data.seo?.description ?? null,
    data.seo?.og_image ?? null,
    data.status || 'draft',
    data.featured ? 1 : 0,
    data.new_arrival ? 1 : 0,
  ];
}

function buildProductInsertStatement(db, id, data) {
  const placeholders = PRODUCT_COLUMNS.split(', ').map(() => '?').join(', ');
  return db.prepare(`INSERT INTO products (id, ${PRODUCT_COLUMNS}) VALUES (?, ${placeholders})`).bind(id, ...productBindValues(data));
}

function buildProductUpdateStatement(db, id, data) {
  const setClause = PRODUCT_COLUMNS.split(', ').map((c) => `${c} = ?`).join(', ');
  return db
    .prepare(`UPDATE products SET ${setClause}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .bind(...productBindValues(data), id);
}

// Material names are display strings, not slugs -- spaces and punctuation
// are preserved as typed. Only whitespace is trimmed, empties dropped, and
// exact-duplicate names (post-trim) collapsed to one.
function normalizeMaterials(materials) {
  const seen = new Set();
  const result = [];
  for (const raw of materials || []) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function buildChildDeleteStatements(db, productId) {
  return [
    db.prepare(`DELETE FROM product_images WHERE product_id = ?`).bind(productId),
    db.prepare(`DELETE FROM product_materials WHERE product_id = ?`).bind(productId),
    db.prepare(`DELETE FROM product_option_values WHERE option_id IN (SELECT id FROM product_options WHERE product_id = ?)`).bind(productId),
    db.prepare(`DELETE FROM product_options WHERE product_id = ?`).bind(productId),
    db.prepare(`DELETE FROM product_customizations WHERE product_id = ?`).bind(productId),
    db.prepare(`DELETE FROM product_collections WHERE product_id = ?`).bind(productId),
    db.prepare(`DELETE FROM product_special_request WHERE product_id = ?`).bind(productId),
    db.prepare(`DELETE FROM product_deposit WHERE product_id = ?`).bind(productId),
  ];
}

// Always inserts special_request/deposit rows when the admin editor submits
// them, regardless of `enabled` -- preserves whatever message/percentage/etc
// was configured across an enabled-toggle rather than discarding it, since
// every save from AdminProductEdit.jsx sends the full object either way.
function buildChildInsertStatements(db, productId, data) {
  const stmts = [];

  (data.images || []).forEach((img, i) => {
    stmts.push(
      db
        .prepare(`INSERT INTO product_images (id, product_id, url, alt, featured, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), productId, img.url, img.alt ?? null, img.featured ? 1 : 0, i),
    );
  });

  // Trim + drop empties + dedupe here, not just in the admin UI -- this is
  // the one place both create() and update() funnel through, so it's the
  // authoritative guarantee regardless of what a client sends (instruction:
  // "Prevent duplicate material entries for the same product").
  normalizeMaterials(data.materials).forEach((material, i) => {
    stmts.push(
      db.prepare(`INSERT INTO product_materials (id, product_id, material, sort_order) VALUES (?, ?, ?, ?)`).bind(crypto.randomUUID(), productId, material, i),
    );
  });

  (data.options || []).forEach((opt, i) => {
    const optionId = crypto.randomUUID();
    stmts.push(
      db
        .prepare(`INSERT INTO product_options (id, product_id, name, type, required, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(optionId, productId, opt.name, opt.type, opt.required ? 1 : 0, i),
    );
    (opt.values || []).forEach((v, vi) => {
      stmts.push(
        db
          .prepare(
            `INSERT INTO product_option_values (id, option_id, label, price_modifier_cents, sku_suffix, swatch, available, lead_time, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), optionId, v.label ?? '', amountToCents(v.price_modifier || 0), v.sku_suffix ?? null, v.swatch ?? null, v.available === false ? 0 : 1, v.lead_time ?? null, vi),
      );
    });
  });

  (data.customizations || []).forEach((c, i) => {
    stmts.push(
      db
        .prepare(
          `INSERT INTO product_customizations (id, product_id, label, type, price_cents, options_json, placeholder, max_length, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), productId, c.label, c.type, amountToCents(c.price || 0), c.options?.length ? JSON.stringify(c.options) : null, c.placeholder || null, c.max_length ?? null, i),
    );
  });

  (data.collection_ids || []).forEach((collectionId) => {
    stmts.push(db.prepare(`INSERT INTO product_collections (product_id, collection_id) VALUES (?, ?)`).bind(productId, collectionId));
  });

  if (data.special_request) {
    const sr = data.special_request;
    stmts.push(
      db
        .prepare(
          `INSERT INTO product_special_request (product_id, enabled, message, allow_images, max_images, payment_behaviour) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(productId, sr.enabled ? 1 : 0, sr.message ?? null, sr.allow_images === false ? 0 : 1, sr.max_images ?? 3, sr.payment_behaviour || 'immediate'),
    );
  }

  if (data.deposit) {
    const dep = data.deposit;
    stmts.push(
      db
        .prepare(`INSERT INTO product_deposit (product_id, enabled, type, value) VALUES (?, ?, ?, ?)`)
        .bind(productId, dep.enabled ? 1 : 0, dep.type || 'fixed', dep.type === 'fixed' ? amountToCents(dep.value || 0) : Math.round(dep.value || 0)),
    );
  }

  return stmts;
}
