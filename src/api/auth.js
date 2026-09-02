// Aurora authentication service.
// The React application (AuthContext, Login, Register, ForgotPassword,
// ResetPassword, admin guards) talks ONLY to this interface. The implementation
// is currently delegated to the Cloudflare adapter; swap the import to migrate.
import { backend } from '@/api/backend/cloudflare';

export const auth = {
  /** True when a session token exists locally (does not validate it). */
  hasSession: () => backend.auth.hasSession(),

  /**
   * Verifies the current visitor is allowed to load the app at all.
   * Resolves with app-level public settings; rejects with an Error carrying
   * `code`: 'auth_required' | 'user_not_registered' | 'unknown'.
   */
  checkAccess: () => backend.auth.checkAppAccess(),

  /** Current user: { id, email, full_name, role, ... }. Rejects with code 'auth_required' if signed out. */
  me: () => backend.auth.me(),

  /** Email + password login. Stores the session; caller performs a hard redirect. */
  login: (email, password) => backend.auth.loginWithPassword(email, password),

  /** Starts the Google OAuth flow; the browser is redirected away and back to `returnTo`. */
  loginWithGoogle: (returnTo) => backend.auth.loginWithProvider('google', returnTo),

  /** Creates an unverified account. Must be followed by verifyEmail(). */
  register: ({ email, password }) => backend.auth.register({ email, password }),

  /** Confirms the emailed one-time code and establishes the session. */
  verifyEmail: async ({ email, code }) => {
    const result = await backend.auth.verifyEmail({ email, code });
    if (result?.access_token) backend.auth.setSession(result.access_token);
    return result;
  },

  resendVerification: (email) => backend.auth.resendVerification(email),

  /** Clears the session. With `redirectUrl`, navigates there afterwards; otherwise reloads. */
  logout: (redirectUrl) => backend.auth.logout(redirectUrl),

  /** Sends the visitor to the login page, returning to `nextUrl` afterwards. */
  redirectToLogin: (nextUrl) => backend.auth.redirectToLogin(nextUrl),

  /** Always treat as success in the UI — the backend hides whether the email exists. */
  forgotPassword: (email) => backend.auth.requestPasswordReset(email),

  resetPassword: ({ token, newPassword }) => backend.auth.resetPassword({ token, newPassword }),
};