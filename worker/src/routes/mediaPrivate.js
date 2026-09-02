import { getCookie } from '../lib/cookies.js';
import { sha256Hex, constantTimeEqualHex } from '../lib/crypto.js';
import { SESSION_COOKIE as AUTH_SESSION_COOKIE } from '../lib/authGuard.js';
import { NotFoundError } from '../lib/http.js';

// Serves a private-bucket object to either an admin session or the holder
// of its per-object access token -- never to the id alone (same ownership
// shape as GET /api/orders/:id). A soft session check (no throw on
// missing/invalid session) since an anonymous customer presenting a valid
// token is just as legitimate a caller here as an admin.
export function registerPrivateMediaRoutes(router) {
  // A distinct top-level prefix, not /media/private/:id -- the public
  // GET /media/:key* (routes/media.js) is a greedy wildcard that would
  // otherwise swallow anything under /media/ ahead of this route matching
  // at all, depending on registration order. Registered in wrangler.jsonc's
  // run_worker_first alongside /api/* and /media/*.
  router.get('/media-private/:id', async (ctx) => {
    const asset = await ctx.repositories.mediaAssets.findById(ctx.params.id);
    if (!asset) throw new NotFoundError('Not found');

    let isAdmin = false;
    const sessionToken = getCookie(ctx.request, AUTH_SESSION_COOKIE);
    if (sessionToken) {
      const session = await ctx.repositories.sessions.findActiveByTokenHash(await sha256Hex(sessionToken));
      if (session) {
        const user = await ctx.repositories.users.findById(session.user_id);
        isAdmin = user?.role === 'admin';
      }
    }

    const presentedToken = ctx.url.searchParams.get('token');
    const tokenMatches = presentedToken && asset.access_token_hash && constantTimeEqualHex(await sha256Hex(presentedToken), asset.access_token_hash);

    if (!isAdmin && !tokenMatches) throw new NotFoundError('Not found');

    const object = await ctx.repositories.uploadsPrivate.get(asset.r2_key);
    if (!object) throw new NotFoundError('Not found');

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // Never cached at a shared/CDN layer -- access here is authorised per
    // request (session or token), not baked into the URL being unguessable
    // alone the way the public /media/:key route is.
    headers.set('cache-control', 'private, no-store');
    return new Response(object.body, { headers });
  });
}
