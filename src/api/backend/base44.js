// BASE44 ADAPTER
// ---------------------------------------------------------------------------
// The ONLY place in the Aurora codebase that talks to the Base44 SDK.
// src/api/aurora.js and src/api/auth.js consume this module and expose
// Aurora-owned interfaces to the React application.
//
// To migrate away from Base44: implement a new module with the same exported
// `backend` shape (collections, media, auth) on top of a REST API, then point
// aurora.js / auth.js at it. No UI code needs to change.
// ---------------------------------------------------------------------------
import { base44 } from '@/api/base44Client';
import { appParams } from '@/api/backend/appParams';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

// Generic record store over one Base44 entity.
const collection = (entityName) => ({
  list: (sort, limit) => base44.entities[entityName].list(sort, limit),
  filter: (query, sort, limit) => base44.entities[entityName].filter(query, sort, limit),
  get: (id) => base44.entities[entityName].get(id),
  create: (data) => base44.entities[entityName].create(data),
  update: (id, data) => base44.entities[entityName].update(id, data),
  remove: (id) => base44.entities[entityName].delete(id),
});

// Normalise Base44 auth/HTTP errors into a platform-neutral shape:
// { code: 'auth_required' | 'user_not_registered' | <reason> | 'unknown', message, status }
const toAuthError = (error) => {
  const reason = error?.data?.extra_data?.reason;
  let code = 'unknown';
  if (error?.status === 403 && reason) code = reason;
  else if (error?.status === 401 || error?.status === 403) code = 'auth_required';
  const e = new Error(error?.message || 'Authentication error');
  e.code = code;
  e.status = error?.status;
  return e;
};

export const backend = {
  collections: {
    products: collection('Product'),
    categories: collection('Category'),
    collections: collection('Collection'),
    orders: collection('Order'),
    bespokeRequests: collection('BespokeRequest'),
    discountCodes: collection('DiscountCode'),
    storeSettings: collection('StoreSettings'),
    newsletterSubscribers: collection('NewsletterSubscriber'),
    users: collection('User'), // read-only in practice; Base44 owns user records
  },

  media: {
    // Uploads to Base44 public file storage and returns a permanent public URL.
    upload: async (file) => {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      return file_url;
    },
  },

  auth: {
    hasSession: () => !!appParams.token,

    // App-level access check. Base44 private apps can refuse anonymous users
    // ('auth_required') or users not on the allow-list ('user_not_registered').
    // Returns the app's public settings or throws a normalised auth error.
    checkAppAccess: async () => {
      const client = createAxiosClient({
        baseURL: '/api/apps/public',
        headers: { 'X-App-Id': appParams.appId },
        token: appParams.token,
        interceptResponses: true,
      });
      try {
        return await client.get(`/prod/public-settings/by-id/${appParams.appId}`);
      } catch (error) {
        throw toAuthError(error);
      }
    },

    me: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        throw toAuthError(error);
      }
    },
    loginWithPassword: (email, password) => base44.auth.loginViaEmailPassword(email, password),
    loginWithProvider: (provider, returnTo) => base44.auth.loginWithProvider(provider, returnTo),
    register: ({ email, password }) => base44.auth.register({ email, password }),
    verifyEmail: ({ email, code }) => base44.auth.verifyOtp({ email, otpCode: code }),
    resendVerification: (email) => base44.auth.resendOtp(email),
    setSession: (accessToken) => base44.auth.setToken(accessToken),
    logout: (redirectUrl) => base44.auth.logout(redirectUrl),
    redirectToLogin: (nextUrl) => base44.auth.redirectToLogin(nextUrl),
    requestPasswordReset: (email) => base44.auth.resetPasswordRequest(email),
    resetPassword: ({ token, newPassword }) => base44.auth.resetPassword({ resetToken: token, newPassword }),
  },
};