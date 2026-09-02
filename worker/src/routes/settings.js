export function registerSettingsRoutes(router) {
  router.get('/api/settings', async (ctx) => {
    const settings = await ctx.repositories.settings.getPublic();
    return ctx.json({ settings });
  });
}
