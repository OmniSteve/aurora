import { ValidationError } from '../lib/http.js';

export function createCategoriesRepository(db) {
  return {
    async listPublished() {
      const { results } = await db.prepare(`SELECT * FROM categories WHERE published = 1 ORDER BY sort_order ASC`).all();
      return results.map(mapCategory);
    },

    async listAllAdmin() {
      const { results } = await db.prepare(`SELECT * FROM categories ORDER BY sort_order ASC`).all();
      return results.map(mapCategory);
    },

    async create(data) {
      const id = crypto.randomUUID();
      try {
        await db
          .prepare(
            `INSERT INTO categories (id, name, slug, description, image_url, sort_order, published, seo_title, seo_description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, data.name, data.slug || null, data.description ?? null, data.image ?? null, data.sort_order ?? 0, data.published === false ? 0 : 1, data.seo?.title ?? null, data.seo?.description ?? null)
          .run();
      } catch (err) {
        if (String(err.message || err).includes('UNIQUE')) throw new ValidationError('This slug is already in use by another category.');
        throw err;
      }
      return this.getById(id);
    },

    async update(id, data) {
      try {
        await db
          .prepare(
            `UPDATE categories SET name = ?, slug = ?, description = ?, image_url = ?, sort_order = ?, published = ?, seo_title = ?, seo_description = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?`,
          )
          .bind(data.name, data.slug || null, data.description ?? null, data.image ?? null, data.sort_order ?? 0, data.published === false ? 0 : 1, data.seo?.title ?? null, data.seo?.description ?? null, id)
          .run();
      } catch (err) {
        if (String(err.message || err).includes('UNIQUE')) throw new ValidationError('This slug is already in use by another category.');
        throw err;
      }
      return this.getById(id);
    },

    getById(id) {
      return db.prepare(`SELECT * FROM categories WHERE id = ?`).bind(id).first().then((row) => (row ? mapCategory(row) : null));
    },

    // Refused, not cascaded, when a product still references this category
    // -- products.category_id would otherwise be left dangling.
    async remove(id) {
      const used = await db.prepare(`SELECT 1 FROM products WHERE category_id = ? LIMIT 1`).bind(id).first();
      if (used) throw new ValidationError('This category has products assigned to it. Reassign them before deleting.');
      await db.prepare(`DELETE FROM categories WHERE id = ?`).bind(id).run();
    },
  };
}

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    image: row.image_url,
    sort_order: row.sort_order,
    published: !!row.published,
    seo: { title: row.seo_title, description: row.seo_description },
    created_date: row.created_at,
    updated_date: row.updated_at,
  };
}
