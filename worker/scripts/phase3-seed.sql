INSERT INTO categories (id, name, slug, published) VALUES ('cat_test', 'Rings', 'rings', 1);
INSERT INTO products (id, name, slug, price_cents, category_id, status) VALUES ('prod_pub', 'Published Ring', 'published-ring', 45000, 'cat_test', 'published');
INSERT INTO products (id, name, slug, price_cents, category_id, status) VALUES ('prod_draft', 'Draft Ring', 'draft-ring', 30000, 'cat_test', 'draft');
INSERT INTO products (id, name, slug, price_cents, category_id, status) VALUES ('prod_archived', 'Archived Ring', 'archived-ring', 20000, 'cat_test', 'archived');
INSERT INTO product_materials (id, product_id, material, sort_order) VALUES ('mat_1', 'prod_pub', '18ct Gold', 0);
