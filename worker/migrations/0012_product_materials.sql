-- Product.materials[] was missed in 0001_catalogue.sql -- caught while
-- building the products repository against migration/DATA_MODEL.md, which
-- documents it as a real field ("free text e.g. '18ct Gold'", used for the
-- PDP accordion and the shop's derived material filter). Added as its own
-- migration rather than editing the already-applied 0001.
--
-- A child table (not a materials_json column on products) so the "distinct
-- materials across published products" filter set can be derived in SQL
-- later instead of deserializing every product row to build it.

CREATE TABLE product_materials (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  material    TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_materials_product ON product_materials(product_id, sort_order);
CREATE INDEX idx_product_materials_lookup ON product_materials(material);
