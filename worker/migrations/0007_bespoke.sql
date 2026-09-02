-- Bespoke enquiries. Same embedded-array-to-child-table treatment as
-- products/orders: reference_images[], quote and internal_notes[] each
-- become their own table instead of a JSON blob rewritten on every update.

CREATE TABLE bespoke_requests (
  id                 TEXT PRIMARY KEY,
  customer_name      TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT,
  jewellery_type     TEXT,
  description        TEXT,
  inspiration        TEXT,
  materials          TEXT,
  stones             TEXT,
  approximate_size   TEXT,
  budget             TEXT,
  completion_date    TEXT,
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','reviewing','more_info','quote_prepared','quote_sent','accepted','deposit_required','in_production','ready','completed','declined')),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_bespoke_status_created ON bespoke_requests(status, created_at DESC);

CREATE TABLE bespoke_reference_images (
  id                   TEXT PRIMARY KEY,
  bespoke_request_id   TEXT NOT NULL REFERENCES bespoke_requests(id),
  url                  TEXT NOT NULL,
  sort_order           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_bespoke_images_request ON bespoke_reference_images(bespoke_request_id, sort_order);

CREATE TABLE bespoke_quote (
  bespoke_request_id     TEXT PRIMARY KEY REFERENCES bespoke_requests(id),
  description            TEXT,
  customisation          TEXT,
  materials              TEXT,
  stones                 TEXT,
  estimated_completion   TEXT,
  notes                  TEXT,
  price_cents            INTEGER,
  deposit_type           TEXT CHECK (deposit_type IN ('fixed','percentage')),
  deposit_value          INTEGER
);

CREATE TABLE bespoke_notes (
  id                   TEXT PRIMARY KEY,
  bespoke_request_id   TEXT NOT NULL REFERENCES bespoke_requests(id),
  text                 TEXT NOT NULL,
  created_by           TEXT REFERENCES users(id),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_bespoke_notes_request ON bespoke_notes(bespoke_request_id);
