import { ValidationError } from '../lib/http.js';

export function createCollectionsRepository(db) {
  return {
    async listPublished() {
      const { results } = await db.prepare(`SELECT * FROM collections WHERE published = 1 ORDER BY created_at DESC`).all();
      return results.map(mapCollection);
    },

    async listAllAdmin() {
      const { results } = await db
        .prepare(
          `SELECT co.*, (SELECT COUNT(*) FROM product_collections WHERE collection_id = co.id) AS product_count
             FROM collections co ORDER BY co.created_at DESC`,
        )
        .all();
      return results.map(mapCollection);
    },

    async create(data) {
      const id = crypto.randomUUID();
      try {
        await db
          .prepare(
            `INSERT INTO collections (id, name, slug, description, hero_image_url, published, featured, seo_title, seo_description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, data.name, data.slug || null, data.description ?? null, data.hero_image ?? null, data.published === false ? 0 : 1, data.featured ? 1 : 0, data.seo?.title ?? null, data.seo?.description ?? null)
          .run();
      } catch (err) {
        if (String(err.message || err).includes('UNIQUE')) throw new ValidationError('This slug is already in use by another collection.');
        throw err;
      }
      return this.getById(id);
    },

    async update(id, data) {
      try {
        await db
          .prepare(
            `UPDATE collections SET name = ?, slug = ?, description = ?, hero_image_url = ?, published = ?, featured = ?, seo_title = ?, seo_description = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?`,
          )
          .bind(data.name, data.slug || null, data.description ?? null, data.hero_image ?? null, data.published === false ? 0 : 1, data.featured ? 1 : 0, data.seo?.title ?? null, data.seo?.description ?? null, id)
          .run();
      } catch (err) {
        if (String(err.message || err).includes('UNIQUE')) throw new ValidationError('This slug is already in use by another collection.');
        throw err;
      }
      return this.getById(id);
    },

    getById(id) {
      return db.prepare(`SELECT * FROM collections WHERE id = ?`).bind(id).first().then((row) => (row ? mapCollection(row) : null));
    },

    // Refused, not cascaded, when a product still belongs to this
    // collection -- matches categoriesRepository.remove(). Previously this
    // silently deleted the product_collections links first, which meant
    // deleting a collection quietly detached it from every product using
    // it with no warning.
    async remove(id) {
      const used = await db.prepare(`SELECT 1 FROM product_collections WHERE collection_id = ? LIMIT 1`).bind(id).first();
      if (used) throw new ValidationError('This collection has products assigned to it. Reassign them before deleting.');
      await db.prepare(`DELETE FROM collections WHERE id = ?`).bind(id).run();
    },
  };
}

function mapCollection(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    hero_image: row.hero_image_url,
    published: !!row.published,
    featured: !!row.featured,
    seo: { title: row.seo_title, description: row.seo_description },
    created_date: row.created_at,
    updated_date: row.updated_at,
    ...(row.product_count !== undefined ? { product_count: row.product_count } : {}),
  };
}
