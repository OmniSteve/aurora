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
import { registerAdminStubRoutes } from './routes/adminStubs.js';

import { createProductsRepository } from './repositories/productsRepository.js';
import { createCategoriesRepository } from './repositories/categoriesRepository.js';
import { createCollectionsRepository } from './repositories/collectionsRepository.js';
import { createSettingsRepository } from './repositories/settingsRepository.js';
import { createNewsletterRepository } from './repositories/newsletterRepository.js';
import { createDiscountsRepository } from './repositories/discountsRepository.js';

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
registerAdminStubRoutes(router);

// Same-origin deployment: wrangler.jsonc routes /api/* to this Worker via
// run_worker_first and resolves everything else (static assets, SPA
// fallback) at the assets layer without invoking the Worker at all. If this
// handler is reached for a non-/api/* path, run_worker_first didn't match
// what we expect -- fail loudly rather than guessing.
const dispatch = async (ctx) => {
  if (!ctx.url.pathname.startsWith('/api/')) {
    return ctx.json({ error: 'unexpected_worker_invocation', path: ctx.url.pathname }, 404);
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
    };
    try {
      return await handleRequest({ request, env, url, repositories });
    } catch {
      // withErrorHandling already covers everything inside the router; this
      // is the last-resort net if something throws before ctx.json exists.
      return jsonResponse({ error: 'internal_error', message: 'Something went wrong.' }, 500);
    }
  },
};
