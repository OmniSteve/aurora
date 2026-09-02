import { NotFoundError } from '../lib/http.js';

// Public, unauthenticated by design -- this is a safe development stand-in
// for a real media CDN domain (deliberately not configured yet; see
// migration/plan.html decision D). Serves ONLY from the public R2 bucket;
// there is no equivalent route for UPLOADS_PRIVATE, and none should be
// added without a real access-control story for it.
export function registerMediaRoutes(router) {
  router.get('/media/:key*', async (ctx) => {
    const object = await ctx.env.MEDIA_PUBLIC.get(ctx.params.key);
    if (!object) throw new NotFoundError('Not found');

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    return new Response(object.body, { headers });
  });
}
