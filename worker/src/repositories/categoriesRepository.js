export function createCategoriesRepository(db) {
  return {
    async listPublished() {
      const { results } = await db
        .prepare(
          `SELECT id, name, slug, description, image_url, sort_order, seo_title, seo_description, created_at, updated_at
             FROM categories WHERE published = 1 ORDER BY sort_order ASC`,
        )
        .all();
      return results.map(mapCategory);
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
    published: true,
    seo: { title: row.seo_title, description: row.seo_description },
    created_date: row.created_at,
    updated_date: row.updated_at,
  };
}
