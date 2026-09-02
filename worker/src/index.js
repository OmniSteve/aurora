import { createRouter } from './router.js';
import { compose } from './middleware/compose.js';
import { withRequestId } from './middleware/requestId.js';
import { withLogging } from './middleware/logging.js';
import { withErrorHandling } from './middleware/errorHandling.js';
import { jsonResponse } from './lib/http.js';

import { registerHealthRoutes } from './routes/health.js';
import { registerProductRoutes } from './routes/products.js';
import { registerCategoryRoutes } from './routes/categories.js';
import { registerCollectionRoutes } from './routes/collections.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerNewsletterRoutes } from './routes/newsletter.js';
import { registerDiscountRoutes } from './routes/discounts.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerBespokeRoutes } from './routes/bespoke.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerCheckoutRoutes } from './routes/checkout.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerAdminPaymentRoutes } from './routes/adminPayments.js';
import { registerAdminProductRoutes } from './routes/adminProducts.js';
import { registerAdminCategoryRoutes } from './routes/adminCategories.js';
import { registerAdminCollectionRoutes } from './routes/adminCollections.js';
import { registerAdminDiscountRoutes } from './routes/adminDiscounts.js';
import { registerAdminSettingsRoutes } from './routes/adminSettings.js';
import { registerAdminUserRoutes } from './routes/adminUsers.js';
import { registerAdminNewsletterRoutes } from './routes/adminNewsletter.js';
import { registerAdminOrderRoutes } from './routes/adminOrders.js';
import { registerAdminBespokeRoutes } from './routes/adminBespoke.js';
import { registerAdminMediaRoutes } from './routes/adminMedia.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { registerPrivateMediaRoutes } from './routes/mediaPrivate.js';
import { runScheduledSweep } from './scheduled.js';

import { createProductsRepository } from './repositories/productsRepository.js';
import { createCategoriesRepository } from './repositories/categoriesRepository.js';
import { createCollectionsRepository } from './repositories/collectionsRepository.js';
import { createSettingsRepository } from './repositories/settingsRepository.js';
import { createNewsletterRepository } from './repositories/newsletterRepository.js';
import { createDiscountsRepository } from './repositories/discountsRepository.js';
import { createUsersRepository } from './repositories/usersRepository.js';
import { createSessionsRepository } from './repositories/sessionsRepository.js';
import { createAuthTokensRepository } from './repositories/authTokensRepository.js';
import { createOAuthStatesRepository } from './repositories/oauthStatesRepository.js';
import { createRateLimitRepository } from './repositories/rateLimitRepository.js';
import { createInventoryRepository } from './repositories/inventoryRepository.js';
import { createOrdersRepository } from './repositories/ordersRepository.js';
import { createIdempotencyRepository } from './repositories/idempotencyRepository.js';
import { createBespokeRepository } from './repositories/bespokeRepository.js';
import { createMediaRepository } from './repositories/mediaRepository.js';
import { createMediaAssetsRepository } from './repositories/mediaAssetsRepository.js';

const router = createRouter();
registerHealthRoutes(router);
registerProductRoutes(router);
registerCategoryRoutes(router);
registerCollectionRoutes(router);
registerSettingsRoutes(router);
registerNewsletterRoutes(router);
registerDiscountRoutes(router);
registerOrderRoutes(router);
registerBespokeRoutes(router);
registerAuthRoutes(router);
registerMediaRoutes(router);
registerCheckoutRoutes(router);
registerPaymentRoutes(router);
registerWebhookRoutes(router);
registerAdminPaymentRoutes(router);
registerAdminProductRoutes(router);
registerAdminCategoryRoutes(router);
registerAdminCollectionRoutes(router);
registerAdminDiscountRoutes(router);
registerAdminSettingsRoutes(router);
registerAdminUserRoutes(router);
registerAdminNewsletterRoutes(router);
registerAdminOrderRoutes(router);
registerAdminBespokeRoutes(router);
registerAdminMediaRoutes(router);
registerUploadRoutes(router);
registerPrivateMediaRoutes(router);

// Same-origin deployment: wrangler.jsonc routes /api/*, /media/* and
// /media-private/* to this Worker via run_worker_first and resolves
// everything else (static assets, SPA fallback) at the assets layer
// without invoking the Worker at all. If this handler is reached for none
// of those prefixes, run_worker_first didn't match what we expect -- fail
// loudly rather than guessing.
const dispatch = async (ctx) => {
  const path = ctx.url.pathname;
  if (!path.startsWith('/api/') && !path.startsWith('/media/') && !path.startsWith('/media-private/')) {
    return ctx.json({ error: 'unexpected_worker_invocation', path }, 404);
  }
  return router.handle(ctx);
};

const handleRequest = compose(withRequestId, withLogging, withErrorHandling)(dispatch);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const repositories = {
      products: createProductsRepository(env.DB),
      categories: createCategoriesRepository(env.DB),
      collections: createCollectionsRepository(env.DB),
      settings: createSettingsRepository(env.DB),
      newsletter: createNewsletterRepository(env.DB),
      discounts: createDiscountsRepository(env.DB),
      users: createUsersRepository(env.DB),
      sessions: createSessionsRepository(env.DB),
      authTokens: createAuthTokensRepository(env.DB),
      oauthStates: createOAuthStatesRepository(env.DB),
      rateLimits: createRateLimitRepository(env.DB),
      inventory: createInventoryRepository(env.DB),
      orders: createOrdersRepository(env.DB),
      idempotency: createIdempotencyRepository(env.DB),
      bespoke: createBespokeRepository(env.DB),
      mediaAssets: createMediaAssetsRepository(env.DB),
      mediaPublic: createMediaRepository(env.MEDIA_PUBLIC),
      uploadsPrivate: createMediaRepository(env.UPLOADS_PRIVATE),
    };
    try {
      return await handleRequest({ request, env, url, repositories });
    } catch {
      // withErrorHandling already covers everything inside the router; this
      // is the last-resort net if something throws before ctx.json exists.
      return jsonResponse({ error: 'internal_error', message: 'Something went wrong.' }, 500);
    }
  },

  // Cloudflare Cron Trigger (wrangler.jsonc env.dev triggers.crons) --
  // reservation-expiry sweep, see services/paymentService.js.
  async scheduled(_event, env) {
    await runScheduledSweep(env);
  },
};
