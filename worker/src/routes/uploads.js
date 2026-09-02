import { readValidatedUpload } from '../lib/uploadValidation.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { enforceRateLimit, getClientIp } from '../lib/rateLimit.js';

// Anonymous reference-image uploads (bespoke commissions, checkout special
// requests) -- private bucket (aurora-uploads-dev), never a public URL.
// The response embeds a fresh, per-object opaque access token so the
// customer who just uploaded the file can preview it immediately; that
// same token is what routes/mediaPrivate.js checks (instruction: "never
// return a permanently-public private-R2 URL").
export function registerUploadRoutes(router) {
  router.post('/api/uploads/private', async (ctx) => {
    const ip = getClientIp(ctx.request);
    await enforceRateLimit(ctx, {
      action: 'private-upload',
      identifier: ip,
      limit: 30,
      windowSeconds: 3600,
      cfBinding: ctx.env.RL_PUBLIC,
      cfKey: ip,
    });

    const { file, ext, contentType } = await readValidatedUpload(ctx.request);
    const id = crypto.randomUUID();
    const key = `uploads/${id}.${ext}`;
    const token = randomToken(24);

    await ctx.repositories.uploadsPrivate.put(key, await file.arrayBuffer(), { httpMetadata: { contentType } });
    await ctx.repositories.mediaAssets.create({
      id,
      r2Key: key,
      bucket: 'private',
      contentType,
      sizeBytes: file.size,
      accessTokenHash: await sha256Hex(token),
    });

    return ctx.json({ url: `/media-private/${id}?token=${token}` }, 201);
  });
}
