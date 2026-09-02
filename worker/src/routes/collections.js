export function registerCollectionRoutes(router) {
  router.get('/api/collections', async (ctx) => {
    const collections = await ctx.repositories.collections.listPublished();
    return ctx.json({ collections });
  });
}
