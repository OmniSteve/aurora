// worker/migrations/0008_settings.sql's media_assets table -- tracks every
// R2 upload (key, bucket, size, mime, uploader), unlike Base44 which kept
// only a URL string and could never delete or attribute anything
// (migration/MEDIA.md).
export function createMediaAssetsRepository(db) {
  return {
    async create({ id, r2Key, bucket, url, contentType, sizeBytes, uploadedBy, accessTokenHash }) {
      await db
        .prepare(
          `INSERT INTO media_assets (id, r2_key, bucket, url, content_type, size_bytes, uploaded_by, access_token_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, r2Key, bucket, url ?? null, contentType ?? null, sizeBytes ?? null, uploadedBy ?? null, accessTokenHash ?? null)
        .run();
    },

    findById(id) {
      return db.prepare(`SELECT * FROM media_assets WHERE id = ?`).bind(id).first();
    },
  };
}
