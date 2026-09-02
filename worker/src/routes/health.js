export function registerHealthRoutes(router) {
  router.get('/api/health', async (ctx) => {
    let dbStatus = 'unavailable';
    let healthy = false;
    try {
      const row = await ctx.env.DB.prepare('SELECT 1 AS ok').first();
      if (row?.ok === 1) {
        dbStatus = 'ok';
        healthy = true;
      }
    } catch (err) {
      // Server-side only -- no exception detail crosses the response boundary.
      console.error(JSON.stringify({
        requestId: ctx.requestId,
        scope: 'health_check',
        error: String((err && err.message) || err),
      }));
    }

    return ctx.json(
      { status: healthy ? 'ok' : 'degraded', db: dbStatus, timestamp: new Date().toISOString() },
      healthy ? 200 : 503,
    );
  });
}
