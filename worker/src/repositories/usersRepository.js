export function createUsersRepository(db) {
  const findById = (id) => db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first();
  const findByEmail = (email) => db.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first();

  return {
    findById,
    findByEmail,
    findByGoogleSub: (sub) => db.prepare(`SELECT * FROM users WHERE google_sub = ?`).bind(sub).first(),

    async create({ id, email, passwordHash, passwordAlgo, fullName, emailVerified = false, role = 'user' }) {
      await db
        .prepare(
          `INSERT INTO users (id, email, password_hash, password_algo, full_name, role, email_verified)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, email, passwordHash ?? null, passwordAlgo ?? null, fullName ?? null, role, emailVerified ? 1 : 0)
        .run();
      return findById(id);
    },

    // Registering again with an email that has an *unverified* account
    // overwrites the pending registration (password, name, fresh OTP
    // issued by the caller) rather than creating a second row -- this is
    // the "retry" half of the stale-unverified-account strategy (instruction
    // #4). A scheduled purge of very-old unverified rows (e.g. 30+ days) is
    // a reasonable future addition once the Cron infrastructure exists
    // (Phase 7) but isn't required for correctness today.
    async overwritePendingRegistration(id, { passwordHash, passwordAlgo, fullName }) {
      await db
        .prepare(`UPDATE users SET password_hash = ?, password_algo = ?, full_name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .bind(passwordHash, passwordAlgo, fullName ?? null, id)
        .run();
      return findById(id);
    },

    async setEmailVerified(id) {
      await db
        .prepare(`UPDATE users SET email_verified = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .bind(id)
        .run();
    },

    async updatePasswordHash(id, passwordHash, passwordAlgo) {
      await db
        .prepare(
          `UPDATE users SET password_hash = ?, password_algo = ?, must_reset_password = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        )
        .bind(passwordHash, passwordAlgo, id)
        .run();
    },

    // Linking is atomic and conditional on the google_sub still being free
    // -- see services/googleOAuthService.js for the full linking policy.
    // UNIQUE(google_sub) on the users table is the actual last line of
    // defense against two accounts claiming the same sub.
    async linkGoogleSub(id, googleSub) {
      const result = await db
        .prepare(`UPDATE users SET google_sub = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND google_sub IS NULL`)
        .bind(googleSub, id)
        .run();
      return result.meta.changes === 1;
    },

    async createFromGoogle({ id, email, fullName, googleSub }) {
      await db
        .prepare(
          `INSERT INTO users (id, email, full_name, role, email_verified, google_sub)
           VALUES (?, ?, ?, 'user', 1, ?)`,
        )
        .bind(id, email, fullName ?? null, googleSub)
        .run();
      return findById(id);
    },
  };
}

// Never spread a raw `users` row into an API response -- this is the one
// function allowed to turn a DB row into something a client sees.
export function toSafeProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    email_verified: !!row.email_verified,
  };
}
