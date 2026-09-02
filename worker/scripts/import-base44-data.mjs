#!/usr/bin/env node
// Phase 5 data + branding-media import: Base44 export -> aurora-dev.
//
// Usage:
//   node worker/scripts/import-base44-data.mjs --target=local   (default)
//   node worker/scripts/import-base44-data.mjs --target=remote
//   node worker/scripts/import-base44-data.mjs --target=remote --skip-media
//
// Reads migration/export/*.json (gitignored -- never embed export data in
// this file itself). Generates SQL, applies it via
// `wrangler d1 execute aurora-dev --file <generated> [--local|--remote]`,
// and (unless --skip-media) downloads the three Base44-hosted branding
// images and re-uploads them to aurora-media-dev via
// `wrangler r2 object put ... [--local|--remote]`.
//
// Safe to rerun against a clean database: the generated SQL DELETEs every
// table it's about to repopulate (scoped to exactly the tables this import
// owns -- categories/collections/products and children, discount_codes,
// store_settings, shipping_methods, users, and branding media_assets rows)
// before inserting. Rerunning fully replaces the imported data rather than
// duplicating or erroring.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXPORT_DIR = path.join(REPO_ROOT, 'migration', 'export');

const args = process.argv.slice(2);
const target = (args.find((a) => a.startsWith('--target='))?.split('=')[1]) || 'local';
const skipMedia = args.includes('--skip-media');
if (!['local', 'remote'].includes(target)) {
  console.error(`Invalid --target=${target} (expected "local" or "remote")`);
  process.exit(1);
}
const wranglerFlag = target === 'remote' ? '--remote' : '--local';

function amountToCents(amount) {
  return amount == null ? null : Math.round(Number(amount) * 100);
}

function sqlStr(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function sqlNum(value) {
  if (value === null || value === undefined) return 'NULL';
  return String(Number(value));
}
function sqlBool(value) {
  return value ? '1' : '0';
}

async function readExport(name) {
  const raw = await readFile(path.join(EXPORT_DIR, `${name}.json`), 'utf-8');
  return JSON.parse(raw);
}

function insert(table, columns, valuesRows) {
  if (valuesRows.length === 0) return '';
  const cols = columns.join(', ');
  const rows = valuesRows.map((row) => `(${row.join(', ')})`).join(',\n  ');
  return `INSERT INTO ${table} (${cols}) VALUES\n  ${rows};\n`;
}

async function main() {
  console.log(`Aurora Phase 5 import -- target: ${target}${skipMedia ? ' (media skipped)' : ''}`);

  const [categories, collections, products, discounts, settingsArr, users, orders, bespoke, newsletter] = await Promise.all(
    ['categories', 'collections', 'products', 'discounts', 'settings', 'users', 'orders', 'bespoke_requests', 'newsletter_subscribers'].map(
      readExport,
    ),
  );

  const sourceCounts = {
    categories: categories.length,
    collections: collections.length,
    products: products.length,
    discounts: discounts.length,
    settings: settingsArr.length,
    users: users.length,
    orders: orders.length,
    bespoke_requests: bespoke.length,
    newsletter_subscribers: newsletter.length,
  };
  console.log('Source record counts:', JSON.stringify(sourceCounts));

  if (orders.length > 0 || bespoke.length > 0) {
    console.log(`NOTE: source export contains ${orders.length} orders and ${bespoke.length} bespoke requests --`);
    console.log('this script does not import them yet (out of scope for Phase 5 per the handover snapshot being empty).');
  }

  let sql = '';

  // ---- DELETE (children first) -- scoped to exactly what this import owns.
  sql += `
DELETE FROM product_option_values;
DELETE FROM product_options;
DELETE FROM product_customizations;
DELETE FROM product_special_request;
DELETE FROM product_deposit;
DELETE FROM product_images;
DELETE FROM product_materials;
DELETE FROM product_collections;
DELETE FROM products;
DELETE FROM categories;
DELETE FROM collections;
DELETE FROM discount_codes;
DELETE FROM shipping_methods;
DELETE FROM store_settings;
DELETE FROM users;
DELETE FROM media_assets WHERE r2_key LIKE 'branding/%';
`;

  // ---- categories
  sql += insert(
    'categories',
    ['id', 'name', 'slug', 'description', 'image_url', 'sort_order', 'published', 'seo_title', 'seo_description', 'created_at', 'updated_at'],
    categories.map((c) => [
      sqlStr(c.id), sqlStr(c.name), sqlStr(c.slug), sqlStr(c.description), sqlStr(c.image),
      sqlNum(c.sort_order ?? 0), sqlBool(c.published !== false), sqlStr(c.seo?.title), sqlStr(c.seo?.description),
      sqlStr(c.created_date + 'Z'), sqlStr((c.updated_date || c.created_date) + 'Z'),
    ]),
  );

  // ---- collections
  sql += insert(
    'collections',
    ['id', 'name', 'slug', 'description', 'hero_image_url', 'published', 'featured', 'seo_title', 'seo_description', 'created_at', 'updated_at'],
    collections.map((c) => [
      sqlStr(c.id), sqlStr(c.name), sqlStr(c.slug), sqlStr(c.description), sqlStr(c.hero_image),
      sqlBool(c.published !== false), sqlBool(!!c.featured), sqlStr(c.seo?.title), sqlStr(c.seo?.description),
      sqlStr(c.created_date + 'Z'), sqlStr((c.updated_date || c.created_date) + 'Z'),
    ]),
  );

  // ---- products (+ every child table)
  sql += insert(
    'products',
    [
      'id', 'name', 'slug', 'sku', 'short_description', 'description', 'price_cents', 'sale_price_cents',
      'category_id', 'availability', 'stock_quantity', 'lead_time', 'care_info', 'shipping_info',
      'seo_title', 'seo_description', 'seo_og_image', 'status', 'featured', 'new_arrival', 'created_at', 'updated_at',
    ],
    products.map((p) => [
      sqlStr(p.id), sqlStr(p.name), sqlStr(p.slug), sqlStr(p.sku), sqlStr(p.short_description), sqlStr(p.description),
      sqlNum(amountToCents(p.price)), sqlNum(amountToCents(p.sale_price)),
      sqlStr(p.category_id), sqlStr(p.availability || 'in_stock'), sqlNum(p.stock_quantity), sqlStr(p.lead_time),
      sqlStr(p.care_info), sqlStr(p.shipping_info),
      sqlStr(p.seo?.title), sqlStr(p.seo?.description), sqlStr(p.seo?.og_image || null),
      sqlStr(p.status || 'published'), sqlBool(!!p.featured), sqlBool(!!p.new_arrival),
      sqlStr(p.created_date + 'Z'), sqlStr((p.updated_date || p.created_date) + 'Z'),
    ]),
  );

  const productCollectionRows = [];
  const imageRows = [];
  const materialRows = [];
  const optionRows = [];
  const optionValueRows = [];
  const customizationRows = [];
  const specialRequestRows = [];
  const depositRows = [];

  for (const p of products) {
    for (const collectionId of p.collection_ids || []) {
      productCollectionRows.push([sqlStr(p.id), sqlStr(collectionId)]);
    }
    (p.images || []).forEach((img, i) => {
      imageRows.push([sqlStr(`${p.id}:image:${i}`), sqlStr(p.id), sqlStr(img.url), sqlStr(img.alt), sqlBool(!!img.featured), sqlNum(i)]);
    });
    (p.materials || []).forEach((m, i) => {
      materialRows.push([sqlStr(`${p.id}:material:${i}`), sqlStr(p.id), sqlStr(m), sqlNum(i)]);
    });
    (p.options || []).forEach((opt, oi) => {
      const optionId = `${p.id}:option:${oi}`;
      optionRows.push([sqlStr(optionId), sqlStr(p.id), sqlStr(opt.name), sqlStr(opt.type), sqlBool(!!opt.required), sqlNum(oi)]);
      (opt.values || []).forEach((v, vi) => {
        optionValueRows.push([
          sqlStr(`${optionId}:value:${vi}`), sqlStr(optionId), sqlStr(v.label), sqlNum(amountToCents(v.price_modifier) ?? 0),
          // available NOT NULL DEFAULT 1 -- null/absent in the source means
          // "not specified", which is the same as available; only an
          // explicit false disables the choice.
          sqlStr(v.sku_suffix), sqlStr(v.swatch), sqlBool(v.available !== false), sqlStr(v.lead_time), sqlNum(vi),
        ]);
      });
    });
    (p.customizations || []).forEach((c, ci) => {
      customizationRows.push([
        sqlStr(`${p.id}:customization:${ci}`), sqlStr(p.id), sqlStr(c.label), sqlStr(c.type),
        sqlNum(amountToCents(c.price) ?? 0), sqlStr(JSON.stringify(c.options || [])), sqlStr(c.placeholder), sqlNum(c.max_length), sqlNum(ci),
      ]);
    });
    if (p.special_request) {
      const sr = p.special_request;
      specialRequestRows.push([
        sqlStr(p.id), sqlBool(!!sr.enabled), sqlStr(sr.message), sqlBool(!!sr.allow_images), sqlNum(sr.max_images ?? 0), sqlStr(sr.payment_behaviour || 'immediate'),
      ]);
    }
    if (p.deposit) {
      const d = p.deposit;
      const value = d.type === 'fixed' ? amountToCents(d.value) : Number(d.value ?? 0);
      depositRows.push([sqlStr(p.id), sqlBool(!!d.enabled), sqlStr(d.type || 'fixed'), sqlNum(value)]);
    }
  }

  sql += insert('product_collections', ['product_id', 'collection_id'], productCollectionRows);
  sql += insert('product_images', ['id', 'product_id', 'url', 'alt', 'featured', 'sort_order'], imageRows);
  sql += insert('product_materials', ['id', 'product_id', 'material', 'sort_order'], materialRows);
  sql += insert('product_options', ['id', 'product_id', 'name', 'type', 'required', 'sort_order'], optionRows);
  sql += insert(
    'product_option_values',
    ['id', 'option_id', 'label', 'price_modifier_cents', 'sku_suffix', 'swatch', 'available', 'lead_time', 'sort_order'],
    optionValueRows,
  );
  sql += insert(
    'product_customizations',
    ['id', 'product_id', 'label', 'type', 'price_cents', 'options_json', 'placeholder', 'max_length', 'sort_order'],
    customizationRows,
  );
  sql += insert(
    'product_special_request',
    ['product_id', 'enabled', 'message', 'allow_images', 'max_images', 'payment_behaviour'],
    specialRequestRows,
  );
  sql += insert('product_deposit', ['product_id', 'enabled', 'type', 'value'], depositRows);

  // ---- discount codes
  sql += insert(
    'discount_codes',
    ['id', 'code', 'type', 'value', 'min_spend_cents', 'starts_at', 'ends_at', 'usage_limit', 'usage_count', 'active', 'created_at', 'updated_at'],
    discounts.map((d) => [
      sqlStr(d.id), sqlStr(d.code), sqlStr(d.type || 'percentage'),
      sqlNum(d.type === 'fixed' ? amountToCents(d.value) : d.value),
      sqlNum(amountToCents(d.min_spend) ?? 0), sqlStr(d.starts_at), sqlStr(d.ends_at), sqlNum(d.usage_limit),
      sqlNum(d.usage_count ?? 0), sqlBool(d.active !== false),
      sqlStr(d.created_date + 'Z'), sqlStr((d.updated_date || d.created_date) + 'Z'),
    ]),
  );

  // ---- store settings (forced singleton id=1) + shipping methods
  if (settingsArr.length > 0) {
    const s = settingsArr[0];
    sql += insert(
      'store_settings',
      ['id', 'store_name', 'email', 'phone', 'address', 'currency', 'currency_symbol', 'tax_rate', 'prices_include_tax', 'instagram', 'facebook', 'tiktok', 'stripe_enabled', 'stripe_test_mode'],
      [[
        '1', sqlStr(s.store_name), sqlStr(s.email), sqlStr(s.phone), sqlStr(s.address),
        sqlStr(s.currency || 'GBP'), sqlStr(s.currency_symbol || '£'), sqlNum(s.tax_rate ?? 20), sqlBool(s.prices_include_tax !== false),
        sqlStr(s.instagram), sqlStr(s.facebook), sqlStr(s.tiktok), sqlBool(!!s.stripe_enabled), sqlBool(s.stripe_test_mode !== false),
      ]],
    );
    const shippingRows = (s.shipping_methods || []).map((m, i) => [
      sqlStr(`shipping:${i}`), sqlStr(m.name), sqlNum(amountToCents(m.price) ?? 0), sqlStr(m.estimate), sqlNum(amountToCents(m.free_over)), sqlNum(i),
    ]);
    sql += insert('shipping_methods', ['id', 'name', 'price_cents', 'estimate', 'free_over_cents', 'sort_order'], shippingRows);
  }

  // ---- users -- profiles only. No password_hash, must_reset_password=1,
  // email_verified=1 (these are real known accounts, not fresh
  // registrations -- see the Phase 5 checkpoint for the reasoning), no
  // google_sub (not present in the Base44 export).
  sql += insert(
    'users',
    ['id', 'email', 'password_hash', 'password_algo', 'full_name', 'role', 'email_verified', 'must_reset_password', 'google_sub', 'created_at', 'updated_at'],
    users.map((u) => [
      sqlStr(u.id), sqlStr(u.email), 'NULL', 'NULL', sqlStr(u.full_name), sqlStr(u.role || 'user'), '1', '1', 'NULL',
      sqlStr(u.created_date + 'Z'), sqlStr(u.created_date + 'Z'),
    ]),
  );

  const tmpDir = await mkdtemp(path.join(tmpdir(), 'aurora-import-'));
  const sqlPath = path.join(tmpDir, 'import.sql');
  await writeFile(sqlPath, sql, 'utf-8');
  console.log(`Generated SQL written to ${sqlPath} (${sql.length} bytes)`);

  console.log(`\nApplying to aurora-dev (${wranglerFlag})...`);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'aurora-dev', '--env', 'dev', wranglerFlag, '--file', sqlPath], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
  });

  await rm(tmpDir, { recursive: true, force: true });

  if (!skipMedia) {
    await migrateBrandingMedia();
  }

  console.log('\nImport complete.');
  console.log('Imported counts (top-level):', JSON.stringify({
    categories: categories.length,
    collections: collections.length,
    products: products.length,
    discounts: discounts.length,
    settings: settingsArr.length,
    users: users.length,
    product_images: imageRows.length,
    product_materials: materialRows.length,
    product_options: optionRows.length,
    product_option_values: optionValueRows.length,
    product_customizations: customizationRows.length,
    product_special_request: specialRequestRows.length,
    product_deposit: depositRows.length,
    product_collections: productCollectionRows.length,
    shipping_methods: settingsArr[0]?.shipping_methods?.length ?? 0,
  }));
}

const BRANDING_ASSETS = [
  { name: 'aurora-logo.png', url: 'https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/5aceb367c_aurora.png', contentType: 'image/png' },
  { name: 'hero-image.png', url: 'https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/ff194d237_generated_image.png', contentType: 'image/png' },
  { name: 'bespoke-image.png', url: 'https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/85e389944_generated_image.png', contentType: 'image/png' },
];

async function migrateBrandingMedia() {
  console.log('\nMigrating branding media to aurora-media-dev...');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'aurora-media-'));
  const mediaAssetRows = [];

  for (const [i, asset] of BRANDING_ASSETS.entries()) {
    const key = `branding/${asset.name}`;
    console.log(`  downloading ${asset.url}`);
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`Failed to download ${asset.url}: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const localPath = path.join(tmpDir, asset.name);
    await writeFile(localPath, buffer);

    console.log(`  uploading -> aurora-media-dev/${key} (${wranglerFlag})`);
    execFileSync(
      'npx',
      ['wrangler', 'r2', 'object', 'put', `aurora-media-dev/${key}`, '--file', localPath, '--content-type', asset.contentType, wranglerFlag],
      { cwd: REPO_ROOT, stdio: 'inherit', shell: true },
    );

    mediaAssetRows.push([
      sqlStr(`branding:${i}`), sqlStr(key), sqlStr('public'), sqlStr(`/media/${key}`), sqlStr(asset.contentType), sqlNum(buffer.length), 'NULL',
    ]);
  }

  const trackingSql = insert('media_assets', ['id', 'r2_key', 'bucket', 'url', 'content_type', 'size_bytes', 'uploaded_by'], mediaAssetRows);
  const trackingPath = path.join(tmpDir, 'media_assets.sql');
  await writeFile(trackingPath, trackingSql, 'utf-8');
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'aurora-dev', '--env', 'dev', wranglerFlag, '--file', trackingPath], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
  });

  await rm(tmpDir, { recursive: true, force: true });
  console.log('Branding media migration complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
