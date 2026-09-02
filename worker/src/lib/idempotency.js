// Generic Idempotency-Key orchestration, reused by any write that needs it
// (order creation today). Not order-specific -- see
// repositories/idempotencyRepository.js for the table access and
// worker/migrations/0005_orders.sql / 0011_idempotency_ownership.sql for
// the schema this implements.
import { sha256Hex } from './crypto.js';
import { HttpError, ValidationError } from './http.js';

const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 128;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export class IdempotencyConflictError extends HttpError {
  constructor(message = 'This request is already in progress or was already completed with different data.') {
    super(409, 'idempotency_conflict', message);
  }
}

// Deterministic regardless of key order in the source object, so the same
// logical request always hashes the same way.
export function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
}

export async function fingerprintRequest(body) {
  return sha256Hex(canonicalStringify(body));
}

export function validateIdempotencyKey(key) {
  if (typeof key !== 'string' || key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
    throw new ValidationError('A valid Idempotency-Key header is required.');
  }
}

// Runs `execute()` at most once per (key, request fingerprint, owner).
// - New key -> runs execute(), stores whatever it returns (success or a
//   thrown HttpError) against the key, returns the result.
// - Same key + same fingerprint + same owner, already completed -> replays
//   the stored result without running execute() again.
// - Same key + different fingerprint, or a different owner presenting the
//   same key -> rejected (IdempotencyConflictError / 404 respectively) --
//   never replayed.
// - Same key currently mid-flight (concurrent duplicate) -> rejected with
//   IdempotencyConflictError rather than double-running execute().
export async function withIdempotency(ctx, { key, scope, body, ownerTokenHash, userId, execute }) {
  validateIdempotencyKey(key);
  const requestHash = await fingerprintRequest(body);
  const repo = ctx.repositories.idempotency;

  const claimed = await repo.begin({ key, scope, requestHash, ownerTokenHash, userId });

  if (!claimed) {
    const existing = await repo.find(key);
    if (!existing) {
      // Row vanished between the failed claim and this read (expired +
      // reaped concurrently) -- safe to treat as a fresh key.
      return withIdempotency(ctx, { key, scope, body, ownerTokenHash, userId, execute });
    }
    if (existing.owner_token_hash !== ownerTokenHash) {
      // Don't confirm the key exists to a caller who doesn't own it.
      throw new IdempotencyConflictError('This request is already in progress or was already completed with different data.');
    }
    if (existing.status === 'processing') {
      throw new IdempotencyConflictError('This request is already being processed.');
    }
    if (existing.request_hash !== requestHash) {
      throw new IdempotencyConflictError('This idempotency key was already used for a different request.');
    }
    // Same key, same request, same owner, already completed -> replay.
    const payload = existing.response_body ? JSON.parse(existing.response_body) : null;
    if (existing.response_status >= 200 && existing.response_status < 300) return payload;
    const err = new HttpError(existing.response_status, payload?.error || 'error', payload?.message || 'Request failed');
    err.details = payload?.details;
    throw err;
  }

  try {
    const result = await execute();
    await repo.complete(key, { status: 200, body: result, orderId: result?.order?.id ?? null });
    return result;
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const body_ = err instanceof HttpError
      ? { error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) }
      : { error: 'internal_error', message: 'Something went wrong.' };
    await repo.complete(key, { status, body: body_, orderId: null });
    throw err;
  }
}

export { DEFAULT_TTL_MS };
