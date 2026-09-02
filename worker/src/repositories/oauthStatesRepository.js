export function createOAuthStatesRepository(db) {
  return {
    async create({ id, stateHash, pkceVerifier, returnTo, expiresAt }) {
      await db
        .prepare(`INSERT INTO oauth_states (id, state_hash, pkce_verifier, return_to, expires_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(id, stateHash, pkceVerifier, returnTo, expiresAt)
        .run();
    },

    findValidByStateHash(stateHash) {
      return db
        .prepare(`SELECT * FROM oauth_states WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?`)
        .bind(stateHash, new Date().toISOString())
        .first();
    },

    // Atomic consume: `changes === 1` means this call won the race and the
    // state is genuinely being used for the first time. `false` means it
    // was already consumed -- a replay (or a legitimate double-fire from
    // the browser) and must be rejected either way.
    async consume(id) {
      const result = await db
        .prepare(`UPDATE oauth_states SET consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND consumed_at IS NULL`)
        .bind(id)
        .run();
      return result.meta.changes === 1;
    },
  };
}
