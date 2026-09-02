# Aurora — Data Export

## Snapshot included in this commit

`migration/export/*.json` was exported on **2026-09-02** directly from the Base44 production
database via the SDK (`entities.<Name>.list()`), before this handover commit. Contents:

| File | Records | Notes |
|---|---|---|
| `products.json` | 8 | Full records incl. options, customisations, special_request, deposit, seo |
| `categories.json` | 7 | |
| `collections.json` | 3 | |
| `orders.json` | 0 | No orders had been placed |
| `bespoke_requests.json` | 0 | |
| `discounts.json` | 1 | `WELCOME10` |
| `settings.json` | 1 | StoreSettings singleton |
| `newsletter_subscribers.json` | 0 | |
| `users.json` | 2 | Profile fields only — see limitations |

Records are exactly as returned by Base44, including built-in fields (`id`, `created_date`,
`updated_date`, `created_by_id`, `is_sample`). Optional nested keys that were `null` may be
omitted in a few option values; treat absent and `null` as equivalent.

**No passwords, tokens, API keys or OAuth credentials are included anywhere.**

## Re-running the export before shutdown (recommended)

Data may change between this commit and the final cut-over. Two ways to re-export:

### 1. In-app (no tooling needed) — preferred

1. Sign in as an admin and open **`/admin/export`** (also linked from Admin → Settings → Data Export).
2. Click **Download all** (or download datasets individually). Each downloads `<name>.json`
   matching the layout above.
3. Commit the fresh files to `migration/export/`.

Implementation: `src/pages/admin/AdminExport.jsx` uses only the Aurora `api.*` layer, so it
keeps working after migration too.

### 2. Programmatically via the Base44 SDK

From any Node script authenticated as an admin (see Base44 docs for obtaining a token):

```js
import { createClient } from '@base44/sdk';
const base44 = createClient({ appId: '<APP_ID>', token: '<ADMIN_TOKEN>' });
for (const name of ['Product','Category','Collection','Order','BespokeRequest','DiscountCode','StoreSettings','NewsletterSubscriber']) {
  const rows = await base44.entities[name].list('-created_date', 1000);
  await fs.writeFile(`migration/export/${toFileName(name)}.json`, JSON.stringify(rows, null, 2));
}
```
`list()` accepts a limit; page with `filter` + sort if any entity exceeds 1000 records.

## Limitations

| Item | Limitation | Recommended handling |
|---|---|---|
| **User credentials** | Base44 owns password hashes, Google OAuth links and email-verification state. They cannot be read through any API. | Import `users.json` (id, email, full_name, role) into the new auth system as accounts with **no password**, then send each user a password-reset / magic-link email. Admin role must be re-applied from `role`. |
| **User list scope** | `User.list()` is only permitted for admins. | Run the export as an admin (the in-app page enforces this). |
| **Uploaded files** | Export contains URLs, not binaries. | Follow `MEDIA.md` to download and re-host. Zero such URLs exist at snapshot time. |
| **`created_by_id`** | References Base44 user ids. | Map via `users.json` or drop. |
| **Timestamps** | Strings without timezone (`2026-09-01T16:35:00.699000`), UTC. | Append `Z` on import. |
| **Base44 app settings** (public/private mode, allowed users, custom domain, OAuth config) | Not exportable via SDK. | Note manually from the Base44 dashboard before deletion. |

## Import order for the new database

1. `categories.json`, `collections.json` (no dependencies)
2. `products.json` (references category/collection ids — keep the same ids or build an id map)
3. `discounts.json`, `settings.json`, `newsletter_subscribers.json`
4. `users.json` (auth system)
5. `orders.json`, `bespoke_requests.json` (embed snapshots; only `items[].product_id` references products)