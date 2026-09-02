import { requireAdmin, requireCsrf } from '../lib/authGuard.js';
import { readValidatedUpload } from '../lib/uploadValidation.js';
import { enforceRateLimit, getClientIp } from '../lib/rateLimit.js';

// Admin-only catalogue/branding media -- public bucket (aurora-media-dev),
// served back through the existing unauthenticated GET /media/:key
// (routes/media.js). Never touches UPLOADS_PRIVATE.
export function registerAdminMediaRoutes(router) {
  router.post('/api/admin/media', async (ctx) => {
    const { session, user } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    await enforceRateLimit(ctx, {
      action: 'admin-media-upload',
      identifier: user.id,
      limit: 60,
      windowSeconds: 3600,
      cfBinding: ctx.env.RL_PUBLIC,
      cfKey: getClientIp(ctx.request),
    });

    const { file, ext, contentType } = await readValidatedUpload(ctx.request);
    const id = crypto.randomUUID();
    const key = `products/${id}.${ext}`;

    await ctx.repositories.mediaPublic.put(key, await file.arrayBuffer(), { httpMetadata: { contentType } });
    await ctx.repositories.mediaAssets.create({ id, r2Key: key, bucket: 'public', url: `/media/${key}`, contentType, sizeBytes: file.size, uploadedBy: user.id });

    return ctx.json({ url: `/media/${key}` }, 201);
  });
}
