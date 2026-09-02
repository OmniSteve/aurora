import { requireAdmin } from '../lib/authGuard.js';

// Safe list only -- usersRepository.listAllSafe() never selects
// password_hash/password_algo/google_sub/must_reset_password.
export function registerAdminUserRoutes(router) {
  router.get('/api/admin/users', async (ctx) => {
    await requireAdmin(ctx);
    return ctx.json({ users: await ctx.repositories.users.listAllSafe() });
  });
}
