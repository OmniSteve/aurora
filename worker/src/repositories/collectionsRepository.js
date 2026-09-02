export function createCollectionsRepository(db) {
  return {
    async listPublished() {
      const { results } = await db
        .prepare(
          `SELECT id, name, slug, description, hero_image_url, featured, seo_title, seo_description, created_at, updated_at
             FROM collections WHERE published = 1 ORDER BY created_at DESC`,
        )
        .all();
      return results.map(mapCollection);
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
    published: true,
    featured: !!row.featured,
    seo: { title: row.seo_title, description: row.seo_description },
    created_date: row.created_at,
    updated_date: row.updated_at,
  };
}
