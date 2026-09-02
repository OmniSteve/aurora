export function createNewsletterRepository(db) {
  return {
    async subscribe(email) {
      const id = crypto.randomUUID();
      // Base44 had no de-duplication; the schema now enforces UNIQUE(email).
      // Re-subscribing is a harmless, common case -- treat it as idempotent
      // success rather than an error.
      await db
        .prepare(`INSERT INTO newsletter_subscribers (id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING`)
        .bind(id, email)
        .run();
      const record = await db
        .prepare(`SELECT id, email, created_at FROM newsletter_subscribers WHERE email = ?`)
        .bind(email)
        .first();
      return { id: record.id, email: record.email, created_date: record.created_at };
    },

    async listAll() {
      const { results } = await db.prepare(`SELECT id, email, created_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 500`).all();
      return results.map((r) => ({ id: r.id, email: r.email, created_date: r.created_at }));
    },
  };
}
