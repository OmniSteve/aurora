// Stripe webhook delivery idempotency (worker/migrations/0006_payments.sql).
// Same INSERT-wins-the-race pattern as repositories/idempotencyRepository.js.
export function createStripeEventsRepository(db) {
  return {
    // Returns { isNew: true } if this event id has never been seen before
    // (caller should process it), or { isNew: false, status } if it has
    // (status 'processed' -> a true duplicate delivery, return 200 without
    // repeating any side effect; status 'received' or 'failed' -> a prior
    // attempt started but never completed successfully, safe/necessary to
    // reprocess).
    async begin({ id, type, payload }) {
      try {
        await db
          .prepare(`INSERT INTO stripe_events (id, type, status, payload) VALUES (?, ?, 'received', ?)`)
          .bind(id, type, payload)
          .run();
        return { isNew: true };
      } catch (err) {
        if (!String(err.message || err).includes('UNIQUE')) throw err;
        const existing = await db.prepare(`SELECT status FROM stripe_events WHERE id = ?`).bind(id).first();
        return { isNew: false, status: existing?.status };
      }
    },

    async markProcessed(id) {
      await db
        .prepare(`UPDATE stripe_events SET status = 'processed', processed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), error = NULL WHERE id = ?`)
        .bind(id)
        .run();
    },

    // Deliberately does NOT flip status to a terminal value -- instruction:
    // "do not mark an event permanently processed if the associated Aurora
    // state mutation failed." Leaving it 'failed' (not 'processed') means
    // the next delivery of the same event id is treated as reprocessable,
    // not a duplicate.
    async markFailed(id, error) {
      await db.prepare(`UPDATE stripe_events SET status = 'failed', error = ? WHERE id = ?`).bind(String(error).slice(0, 2000), id).run();
    },
  };
}
