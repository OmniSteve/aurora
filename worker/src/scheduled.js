// Cron Trigger entry point (wrangler.jsonc env.dev triggers.crons) -- runs
// the reservation-expiry sweep on a schedule, independent of any HTTP
// request. Builds the same `ctx.repositories` shape routes get, minus the
// request-specific fields (no `request`/`url`/session -- nothing here is
// caller-authenticated, it runs on Cloudflare's own trigger).
import { sweepExpiredReservations } from './services/paymentService.js';
import { createInventoryRepository } from './repositories/inventoryRepository.js';
import { createDiscountsRepository } from './repositories/discountsRepository.js';
import { createOrdersRepository } from './repositories/ordersRepository.js';

export async function runScheduledSweep(env) {
  const ctx = {
    env,
    repositories: {
      inventory: createInventoryRepository(env.DB),
      discounts: createDiscountsRepository(env.DB),
      orders: createOrdersRepository(env.DB),
    },
  };
  const results = await sweepExpiredReservations(ctx);
  if (results.length) {
    console.log(JSON.stringify({ scope: 'reservation_sweep', ordersProcessed: results.length, results }));
  }
  return results;
}
