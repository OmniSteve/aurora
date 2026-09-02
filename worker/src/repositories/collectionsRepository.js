import { ValidationError } from '../lib/http.js';

export function createCollectionsRepository(db) {
  return {
    async listPublished() {
      const { results } = await db.prepare(`SELECT * FROM collections WHERE published = 1 ORDER BY created_at DESC`).all();
      return results.map(mapCollection);
    },

    async listAllAdmin() {
      const { results } = await db.prepare(`SELECT * FROM collections ORDER BY created_at DESC`).all();
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

    async remove(id) {
      await db.prepare(`DELETE FROM product_collections WHERE collection_id = ?`).bind(id).run();
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
  };
}
