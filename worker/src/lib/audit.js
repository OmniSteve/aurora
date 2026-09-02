// Security audit trail. Never pass anything containing a password, session
// token, OTP, reset token, OAuth code, CSRF token, or client secret in
// `details` -- it's serialized straight into audit_log.after_json.
export async function logAuditEvent(db, { actorUserId = null, action, entityType, entityId = null, details = null }) {
  await db
    .prepare(
      `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, after_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), actorUserId, action, entityType, entityId, details ? JSON.stringify(details) : null)
    .run();
}
