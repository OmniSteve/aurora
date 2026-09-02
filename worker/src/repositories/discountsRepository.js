export function createDiscountsRepository(db) {
  return {
    async findActiveByCode(code) {
      return db.prepare(`SELECT * FROM discount_codes WHERE code = ? AND active = 1 LIMIT 1`).bind(code).first();
    },
  };
}
