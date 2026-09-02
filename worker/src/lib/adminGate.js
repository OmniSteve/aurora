import { AuthRequiredError } from './http.js';

// Every admin-gated route calls this instead of having real logic, until
// Phase 4 wires up sessions + role checking. 401 (not 403) because nobody
// can be authenticated at all yet -- there is no session mechanism to have
// failed against. Phase 4 replaces this with a real check that can return
// either 401 (no session) or 403 (session, wrong role).
export function requireAdminStub() {
  throw new AuthRequiredError('Admin authentication is not implemented yet.');
}
