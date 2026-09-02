-- Store settings, shipping methods, newsletter, and tracked media uploads.
--
-- store_settings becomes a real singleton via CHECK (id = 1) instead of
-- Base44's "first record returned by list()" (migration/HANDOVER.md #6).
-- shipping_methods[] moves out of the settings JSON blob into its own table.
-- media_assets tracks every R2 upload (key, size, mime, uploader) -- Base44
-- kept only a URL string, so nothing could be deleted or attributed
-- (migration/MEDIA.md).

CREATE TABLE store_settings (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  store_name            TEXT NOT NULL DEFAULT 'Aurora',
  email                 TEXT,
  phone                 TEXT,
  address               TEXT,
  currency              TEXT NOT NULL DEFAULT 'GBP',
  currency_symbol       TEXT NOT NULL DEFAULT '£',
  tax_rate              REAL NOT NULL DEFAULT 20,
  prices_include_tax    INTEGER NOT NULL DEFAULT 1,
  instagram             TEXT,
  facebook              TEXT,
  tiktok                TEXT,
  stripe_enabled        INTEGER NOT NULL DEFAULT 0,
  stripe_test_mode      INTEGER NOT NULL DEFAULT 1,
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE shipping_methods (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  price_cents       INTEGER NOT NULL DEFAULT 0,
  estimate          TEXT,
  free_over_cents   INTEGER,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE newsletter_subscribers (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE media_assets (
  id             TEXT PRIMARY KEY,
  r2_key         TEXT NOT NULL UNIQUE,
  bucket         TEXT NOT NULL CHECK (bucket IN ('public','private')),
  url            TEXT,
  content_type   TEXT,
  size_bytes     INTEGER,
  uploaded_by    TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_media_assets_uploader ON media_assets(uploaded_by);
