import { vi } from 'vitest';
import worker from '../src/index.js';
import { env } from 'cloudflare:test';

const BASE = 'https://example.com';

export function makeRequest(path, { method = 'GET', body, headers = {}, cookies = {}, origin, ip } = {}) {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  const finalHeaders = { ...headers };
  if (cookieHeader) finalHeaders.cookie = cookieHeader;
  if (body !== undefined) finalHeaders['content-type'] = 'application/json';
  if (origin !== undefined) finalHeaders.origin = origin;
  else if (method !== 'GET' && method !== 'HEAD') finalHeaders.origin = BASE;
  // Every call gets its own synthetic IP by default so unrelated tests
  // never collide on the shared Workers RateLimit binding bucket for an
  // action (production requests always have distinct real IPs; tests that
  // specifically exercise rate limiting pass `ip` explicitly to simulate
  // repeated requests from the same client).
  finalHeaders['cf-connecting-ip'] = ip || crypto.randomUUID();

  return new Request(`${BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function call(path, opts) {
  const response = await worker.fetch(makeRequest(path, opts), env);
  let json = null;
  try {
    json = await response.clone().json();
  } catch {
    // no/non-JSON body
  }
  return { response, json, status: response.status, cookies: getSetCookies(response) };
}

export function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

export function extractCookieValue(setCookieStrings, name) {
  for (const c of setCookieStrings) {
    const match = c.match(new RegExp(`^${name}=([^;]*)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

// Returns { session: 'aurora_session value', csrf: 'aurora_csrf value' } from
// a login/verify/register-with-session response's Set-Cookie headers.
export function extractAuthCookies(setCookieStrings) {
  return {
    session: extractCookieValue(setCookieStrings, 'aurora_session'),
    csrf: extractCookieValue(setCookieStrings, 'aurora_csrf'),
    hasSession: extractCookieValue(setCookieStrings, 'aurora_has_session'),
  };
}

export async function cleanupUser(email) {
  await env.DB.prepare(`DELETE FROM auth_tokens WHERE email = ?`).bind(email).run();
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)`).bind(email).run();
  await env.DB.prepare(`DELETE FROM audit_log WHERE actor_user_id IN (SELECT id FROM users WHERE email = ?)`).bind(email).run();
  await env.DB.prepare(`DELETE FROM users WHERE email = ?`).bind(email).run();
}

// Registers + verifies a fresh account, bypassing the need to read a real
// email: temporarily spies on sendEmail to recover the OTP from the
// rendered email body, exactly like registrationAndOtp.test.js does for
// its own assertions. Restores the spy before returning.
export async function registerAndVerify(email, password) {
  const emailLib = await import('../src/lib/email.js');
  const sent = [];
  const spy = vi.spyOn(emailLib, 'sendEmail').mockImplementation(async (_env, { to, html }) => {
    const match = html.match(/(\d{6})/);
    sent.push({ to, code: match ? match[1] : null });
    return { sent: true };
  });
  await call('/api/auth/register', { method: 'POST', body: { email, password } });
  const result = await call('/api/auth/verify-email', { method: 'POST', body: { email, code: sent[0].code } });
  spy.mockRestore();
  return result; // { status, json, cookies } -- cookies include a live session
}

export { env, BASE };
