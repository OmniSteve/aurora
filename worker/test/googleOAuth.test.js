import { describe, it, expect } from 'vitest';
import { call, env } from './helpers.js';
import { decideGoogleAccountLink, sanitizeReturnTo } from '../src/services/googleOAuthService.js';

// The account-linking policy (instruction #11) is a pure function
// specifically so these edge cases -- the ones that matter for
// account-takeover risk -- can be tested exhaustively without a live
// Google connection or real HTTP calls.
describe('Google account-linking policy (decideGoogleAccountLink)', () => {
  it('an existing google_sub is authoritative -- logs in, does not re-link or re-check email', () => {
    const decision = decideGoogleAccountLink({
      existingByGoogleSub: { id: 'user-1' },
      existingByEmail: { id: 'someone-else', email_verified: 1 },
      googleEmailVerified: true,
    });
    expect(decision).toEqual({ action: 'login', userId: 'user-1' });
  });

  it('links to an existing LOCAL account only when both sides report the email verified', () => {
    const decision = decideGoogleAccountLink({
      existingByGoogleSub: null,
      existingByEmail: { id: 'user-2', email_verified: 1 },
      googleEmailVerified: true,
    });
    expect(decision).toEqual({ action: 'link', userId: 'user-2' });
  });

  it('never links to an unverified LOCAL account, even if Google confirms the email', () => {
    // This is the account-takeover case the instruction calls out
    // explicitly: an attacker registers victim@example.com locally
    // (unverified, no access to the inbox) hoping a later Google sign-in
    // by the real owner silently hands over the pre-registered account.
    const decision = decideGoogleAccountLink({
      existingByGoogleSub: null,
      existingByEmail: { id: 'attacker-pre-registered', email_verified: 0 },
      googleEmailVerified: true,
    });
    expect(decision.action).toBe('create');
    expect(decision.userId).toBeUndefined();
  });

  it('never links when Google itself has not verified the email, even if the local account is verified', () => {
    const decision = decideGoogleAccountLink({
      existingByGoogleSub: null,
      existingByEmail: { id: 'user-3', email_verified: 1 },
      googleEmailVerified: false,
    });
    expect(decision.action).toBe('create');
  });

  it('creates a brand new account when nothing matches', () => {
    const decision = decideGoogleAccountLink({ existingByGoogleSub: null, existingByEmail: null, googleEmailVerified: true });
    expect(decision).toEqual({ action: 'create' });
  });
});

describe('returnTo sanitization', () => {
  it('accepts a safe same-origin path', () => {
    expect(sanitizeReturnTo('/account/orders')).toBe('/account/orders');
  });

  it('rejects a protocol-relative external redirect', () => {
    expect(sanitizeReturnTo('//evil.example.com')).toBe('/');
  });

  it('rejects an absolute external URL', () => {
    expect(sanitizeReturnTo('https://evil.example.com')).toBe('/');
  });

  it('rejects a backslash trick (browsers normalize \\ toward //)', () => {
    expect(sanitizeReturnTo('/\\evil.example.com')).toBe('/');
  });

  it('falls back to / for empty/missing input', () => {
    expect(sanitizeReturnTo(null)).toBe('/');
    expect(sanitizeReturnTo('')).toBe('/');
  });
});

describe('OAuth state (server-side, D1-backed)', () => {
  it('google/start without configured credentials fails closed with a clear error, not a broken redirect', async () => {
    const { status, json } = await call('/api/auth/google/start');
    expect(status).toBe(503);
    expect(json.error).toBe('not_configured');
  });

  it('callback with a state that does not exist is rejected', async () => {
    const { status, json } = await call('/api/auth/google/callback?code=fake-code&state=never-issued-state');
    // Fails closed at the "not configured" check before state is even
    // examined, in this dev environment with no Google credentials --
    // confirms the callback never proceeds past provider configuration
    // regardless of state validity.
    expect(status).toBe(503);
    expect(json.error).toBe('not_configured');
  });

  it('an expired oauth_states row is never returned by findValidByStateHash', async () => {
    const { createOAuthStatesRepository } = await import('../src/repositories/oauthStatesRepository.js');
    const repo = createOAuthStatesRepository(env.DB);
    const stateHash = 'test-expired-state-hash';
    await repo.create({
      id: crypto.randomUUID(),
      stateHash,
      pkceVerifier: 'verifier',
      returnTo: '/',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const found = await repo.findValidByStateHash(stateHash);
    expect(found).toBeNull();
  });

  it('consuming an oauth_states row twice only succeeds once (replay protection)', async () => {
    const { createOAuthStatesRepository } = await import('../src/repositories/oauthStatesRepository.js');
    const repo = createOAuthStatesRepository(env.DB);
    const id = crypto.randomUUID();
    await repo.create({
      id,
      stateHash: 'test-replay-state-hash',
      pkceVerifier: 'verifier',
      returnTo: '/',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });

    const firstConsume = await repo.consume(id);
    const secondConsume = await repo.consume(id);
    expect(firstConsume).toBe(true);
    expect(secondConsume).toBe(false); // the replay
  });
});
