import { NotImplementedError } from '../lib/http.js';

// Deliberately not implemented: a working POST /api/orders here would mean
// either trusting client-calculated totals (exactly the Base44-era gap this
// migration exists to close) or building server-authoritative pricing +
// inventory reservations ahead of schedule. Both are Phase 6's job.
export function registerOrderRoutes(router) {
  router.post('/api/orders', async () => {
    throw new NotImplementedError(
      'Order creation is not available yet -- server-authoritative pricing and checkout ship in a later phase.',
    );
  });

  router.get('/api/orders/:id', async () => {
    throw new NotImplementedError('Order lookup is not available yet.');
  });
}
