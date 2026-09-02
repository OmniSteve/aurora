-- Catalogue: categories, collections, products and their child tables.
-- Every embedded array from the Base44 Product/Category/Collection schema
-- becomes a real child table with a foreign key and an explicit sort_order,
-- per migration/DATA_MODEL.md. Money is integer pence (price_cents, not price).

CREATE TABLE categories (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT UNIQUE,
  description      TEXT,
  image_url        TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  published        INTEGER NOT NULL DEFAULT 1,
  seo_title        TEXT,
  seo_description  TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_categories_published_sort ON categories(published, sort_order);

CREATE TABLE collections (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT UNIQUE,
  description      TEXT,
  hero_image_url   TEXT,
  published        INTEGER NOT NULL DEFAULT 1,
  featured         INTEGER NOT NULL DEFAULT 0,
  seo_title        TEXT,
  seo_description  TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_collections_published ON collections(published);

CREATE TABLE products (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  sku                TEXT,
  short_description  TEXT,
  description        TEXT,
  price_cents        INTEGER NOT NULL,
  sale_price_cents   INTEGER,
  category_id        TEXT REFERENCES categories(id),
  availability       TEXT NOT NULL DEFAULT 'in_stock'
                       CHECK (availability IN ('in_stock','low_stock','out_of_stock','made_to_order','preorder')),
  stock_quantity     INTEGER,
  lead_time          TEXT,
  care_info          TEXT,
  shipping_info      TEXT,
  seo_title          TEXT,
  seo_description    TEXT,
  seo_og_image       TEXT,
  status             TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  featured           INTEGER NOT NULL DEFAULT 0,
  new_arrival        INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_products_status_created ON products(status, created_at DESC);
CREATE INDEX idx_products_updated ON products(updated_at DESC);
CREATE INDEX idx_products_category ON products(category_id);

-- Product.collection_ids[] -> join table
CREATE TABLE product_collections (
  product_id     TEXT NOT NULL REFERENCES products(id),
  collection_id  TEXT NOT NULL REFERENCES collections(id),
  PRIMARY KEY (product_id, collection_id)
);
CREATE INDEX idx_product_collections_collection ON product_collections(collection_id);

-- Product.images[]
CREATE TABLE product_images (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  url         TEXT NOT NULL,
  alt         TEXT,
  featured    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_images_product ON product_images(product_id, sort_order);

-- Product.options[]
CREATE TABLE product_options (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('dropdown','buttons','swatches','text','number','checkbox','radio')),
  required    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_options_product ON product_options(product_id, sort_order);

-- Product.options[].values[]
CREATE TABLE product_option_values (
  id                    TEXT PRIMARY KEY,
  option_id             TEXT NOT NULL REFERENCES product_options(id),
  label                 TEXT NOT NULL,
  price_modifier_cents  INTEGER NOT NULL DEFAULT 0,
  sku_suffix            TEXT,
  swatch                TEXT,
  available             INTEGER NOT NULL DEFAULT 1,
  lead_time             TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_option_values_option ON product_option_values(option_id, sort_order);

-- Product.customizations[]
CREATE TABLE product_customizations (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id),
  label        TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('text','number','select','date','checkbox')),
  price_cents  INTEGER NOT NULL DEFAULT 0,
  options_json TEXT,
  placeholder  TEXT,
  max_length   INTEGER,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_customizations_product ON product_customizations(product_id, sort_order);

-- Product.special_request (1:1)
CREATE TABLE product_special_request (
  product_id          TEXT PRIMARY KEY REFERENCES products(id),
  enabled             INTEGER NOT NULL DEFAULT 0,
  message             TEXT,
  allow_images        INTEGER NOT NULL DEFAULT 0,
  max_images          INTEGER NOT NULL DEFAULT 3,
  payment_behaviour   TEXT NOT NULL DEFAULT 'immediate' CHECK (payment_behaviour IN ('immediate','approval','quote'))
);

-- Product.deposit (1:1)
CREATE TABLE product_deposit (
  product_id  TEXT PRIMARY KEY REFERENCES products(id),
  enabled     INTEGER NOT NULL DEFAULT 0,
  type        TEXT NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed','percentage')),
  value       INTEGER NOT NULL DEFAULT 0
);
