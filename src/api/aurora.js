// Aurora API layer — the single integration point between the UI and the backend.
// ---------------------------------------------------------------------------
//   React UI  →  api.* (this file) + auth (src/api/auth.js)  →  backend adapter
//
// No page or component may import the backend adapter or any vendor SDK.
//
// The Cloudflare adapter's methods already match this shape 1:1 (they are
// the routes documented in migration/API_CONTRACT.md), so this file is a
// thin pass-through rather than composing generic entity-CRUD calls the way
// the old Base44 adapter required. An operation not yet migrated throws
// explicitly from within the adapter -- see src/api/backend/cloudflare.js.
// ---------------------------------------------------------------------------
import { backend } from '@/api/backend/cloudflare';
import { auth } from '@/api/auth';

export const api = {
  products: backend.products,
  categories: backend.categories,
  collections: backend.collections,
  checkout: backend.checkout,
  orders: backend.orders,
  payments: backend.payments,
  bespoke: backend.bespoke,
  discounts: backend.discounts,
  settings: backend.settings,
  newsletter: backend.newsletter,
  users: backend.users,
  media: backend.media,
  auth,
};
