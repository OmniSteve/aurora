import { NotImplementedError } from '../lib/http.js';

// Not implemented yet: bespoke submissions normally include reference image
// uploads, and the customer-upload flow is explicitly out of scope for
// Phase 3 (see worker/src/repositories/mediaRepository.js).
export function registerBespokeRoutes(router) {
  router.post('/api/bespoke', async () => {
    throw new NotImplementedError('Bespoke enquiries are not available yet.');
  });
}
