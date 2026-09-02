import { centsToAmount, amountToCents } from '../lib/money.js';

// Same embedded-array-to-child-table treatment as orders/products --
// reference_images[], quote and internal_notes[] are real rows
// (worker/migrations/0007_bespoke.sql), not a JSON blob rewritten wholesale
// on every admin edit.
export function createBespokeRepository(db) {
  return {
    async create(data) {
      const id = crypto.randomUUID();
      const stmts = [
        db
          .prepare(
            `INSERT INTO bespoke_requests (id, customer_name, email, phone, jewellery_type, description, inspiration, materials, stones, approximate_size, budget, completion_date, notes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
          )
          .bind(
            id, data.customer_name, data.email, data.phone ?? null, data.jewellery_type ?? null, data.description ?? null,
            data.inspiration ?? null, data.materials ?? null, data.stones ?? null, data.approximate_size ?? null,
            data.budget ?? null, data.completion_date ?? null, data.notes ?? null,
          ),
        ...(data.reference_images || []).map((url, i) =>
          db
            .prepare(`INSERT INTO bespoke_reference_images (id, bespoke_request_id, url, sort_order) VALUES (?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), id, url, i),
        ),
      ];
      await db.batch(stmts);
      return this.getById(id);
    },

    async listAllAdmin() {
      const { results } = await db.prepare(`SELECT * FROM bespoke_requests ORDER BY created_at DESC LIMIT 500`).all();
      return Promise.all(results.map((row) => hydrate(db, row)));
    },

    async getById(id) {
      const row = await db.prepare(`SELECT * FROM bespoke_requests WHERE id = ?`).bind(id).first();
      return row ? hydrate(db, row) : null;
    },

    // status/notes are simple column updates; quote replaces the 1:1
    // bespoke_quote row wholesale (AdminBespoke.jsx always submits the
    // full quote object together, never a single field of it).
    async update(id, data) {
      const stmts = [];
      if (data.status !== undefined) {
        stmts.push(
          db.prepare(`UPDATE bespoke_requests SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(data.status, id),
        );
      }
      if (data.quote !== undefined) {
        const q = data.quote || {};
        stmts.push(
          db
            .prepare(
              `INSERT INTO bespoke_quote (bespoke_request_id, description, customisation, materials, stones, estimated_completion, notes, price_cents, deposit_type, deposit_value)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(bespoke_request_id) DO UPDATE SET
                 description = excluded.description, customisation = excluded.customisation, materials = excluded.materials,
                 stones = excluded.stones, estimated_completion = excluded.estimated_completion, notes = excluded.notes,
                 price_cents = excluded.price_cents, deposit_type = excluded.deposit_type, deposit_value = excluded.deposit_value`,
            )
            .bind(
              id, q.description ?? null, q.customisation ?? null, q.materials ?? null, q.stones ?? null,
              q.estimated_completion ?? null, q.notes ?? null, q.price == null ? null : amountToCents(q.price),
              q.deposit_type || null, q.deposit_type === 'fixed' ? (q.deposit_value == null ? null : amountToCents(q.deposit_value)) : Math.round(q.deposit_value || 0),
            ),
        );
      }
      if (stmts.length) await db.batch(stmts);
      return this.getById(id);
    },

    async addNote(id, text, createdBy) {
      await db.prepare(`INSERT INTO bespoke_notes (id, bespoke_request_id, text, created_by) VALUES (?, ?, ?, ?)`).bind(crypto.randomUUID(), id, text, createdBy ?? null).run();
    },
  };
}

async function hydrate(db, row) {
  const [images, quote, notes] = await Promise.all([
    db.prepare(`SELECT url FROM bespoke_reference_images WHERE bespoke_request_id = ? ORDER BY sort_order`).bind(row.id).all(),
    db.prepare(`SELECT * FROM bespoke_quote WHERE bespoke_request_id = ?`).bind(row.id).first(),
    db.prepare(`SELECT text, created_at FROM bespoke_notes WHERE bespoke_request_id = ? ORDER BY created_at`).bind(row.id).all(),
  ]);

  return {
    id: row.id,
    customer_name: row.customer_name,
    email: row.email,
    phone: row.phone,
    jewellery_type: row.jewellery_type,
    description: row.description,
    inspiration: row.inspiration,
    materials: row.materials,
    stones: row.stones,
    approximate_size: row.approximate_size,
    budget: row.budget,
    completion_date: row.completion_date,
    reference_images: images.results.map((i) => i.url),
    notes: row.notes,
    status: row.status,
    quote: quote
      ? {
          description: quote.description,
          customisation: quote.customisation,
          materials: quote.materials,
          stones: quote.stones,
          estimated_completion: quote.estimated_completion,
          notes: quote.notes,
          price: centsToAmount(quote.price_cents),
          deposit_type: quote.deposit_type,
          deposit_value: quote.deposit_type === 'fixed' ? centsToAmount(quote.deposit_value) : quote.deposit_value,
        }
      : null,
    internal_notes: notes.results.map((n) => ({ text: n.text, date: n.created_at })),
    created_date: row.created_at,
    updated_date: row.updated_at,
  };
}
