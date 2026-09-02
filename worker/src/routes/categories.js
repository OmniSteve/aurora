export function registerCategoryRoutes(router) {
  router.get('/api/categories', async (ctx) => {
    const categories = await ctx.repositories.categories.listPublished();
    return ctx.json({ categories });
  });
}
