# Aurora — Data Model Dictionary

Source of truth: `base44/entities/*.jsonc` (JSON Schema). This document restates every field with
its usage in the application. Types are JSON types. "Req" = required by schema.

## Built-in fields (every entity, managed by Base44)

| Field | Type | Notes |
|---|---|---|
| `id` | string (24-hex) | Primary key. Referenced across entities as plain strings. |
| `created_date` | ISO-8601 string (no timezone suffix, UTC) | Used for sorting (`-created_date`) and dashboard "today" stats. |
| `updated_date` | ISO-8601 string | Used for admin product sort (`-updated_date`). |
| `created_by_id` | string | User id of creator (null for anonymous). Not used by UI. |
| `is_sample` | boolean | Base44 internal flag. Ignore / drop on migration. |

Timestamps are strings like `2026-09-01T16:35:00.699000` — parse as UTC.

---

## Product

Sellable catalogue item. Supports stock-controlled and made-to-order workflows.

| Field | Type | Req | Default | Enum / shape | Usage |
|---|---|---|---|---|---|
| `name` | string | ✔ | — | | Everywhere |
| `slug` | string | | — | | Public URL `/product/:slug`; lookup via `products.getBySlug` |
| `sku` | string | | — | | Shown on PDP & admin; copied into order lines |
| `short_description` | string | | — | | PDP subtitle, shop search |
| `description` | string | | — | | PDP accordion, shop search |
| `price` | number | | — | GBP, tax-inclusive | Base price |
| `sale_price` | number \| null | | null | | If set, replaces `price` as unit base (`pricing.baseUnitPrice`) |
| `category_id` | string | | — | → `Category.id` | Shop filter, related products |
| `collection_ids` | string[] | | — | → `Collection.id` | Shop filter |
| `images` | Image[] | | — | see below | Gallery, cards, cart line image |
| `materials` | string[] | | — | free text e.g. "18ct Gold" | PDP accordion, shop material filter (derived set) |
| `availability` | string | | `in_stock` | `in_stock` `low_stock` `out_of_stock` `made_to_order` `preorder` | PDP label; `out_of_stock` disables add-to-cart; dashboard low-stock |
| `stock_quantity` | number | | — | | Displayed only; **never decremented** |
| `lead_time` | string | | — | e.g. "3–4 weeks" | PDP copy |
| `options` | Option[] | | — | see below | Variant selectors & price modifiers |
| `customizations` | Customization[] | | — | see below | Personalisation fields & prices |
| `special_request` | SpecialRequestConfig | | — | see below | Free-text request drawer |
| `deposit` | DepositConfig | | — | see below | Deposit vs balance split |
| `care_info` | string | | — | | PDP accordion |
| `shipping_info` | string | | — | | PDP accordion |
| `seo` | `{ title, description, og_image }` | | — | all strings | Admin SEO tab; **not yet rendered into `<head>`** |
| `status` | string | | `published` | `draft` `published` `archived` | Storefront shows `published` only (except `getBySlug`, see HANDOVER risk 8) |
| `featured` | boolean | | false | | Home "Featured Jewellery" row |
| `new_arrival` | boolean | | false | | Home "New Arrivals" row |

### Product.images[] (Image)

| Field | Type | Usage |
|---|---|---|
| `url` | string | Public image URL (Unsplash for seeds; `media.base44.com` for uploads) |
| `alt` | string | Alt text |
| `featured` | boolean | Primary image; falls back to `images[0]` |

### Product.options[] (Option) — variants

| Field | Type | Enum | Usage |
|---|---|---|---|
| `name` | string | | Key used in `Order.items[].options` object |
| `type` | string | `dropdown` `buttons` `swatches` `text` `number` `checkbox` `radio` | Rendered control (`OptionSelector.jsx`) |
| `required` | boolean | | Add-to-cart validation |
| `values` | OptionValue[] | | For select types: choices. For `checkbox`/`text`/`number`: `values[0].price_modifier` is the flat add-on |

### Product.options[].values[] (OptionValue)

| Field | Type | Usage |
|---|---|---|
| `label` | string | Displayed & stored as the selected value |
| `price_modifier` | number | Added to unit price when selected (GBP) |
| `sku_suffix` | string \| null | Stored only; not used in UI |
| `swatch` | string \| null | Hex colour for `swatches` type |
| `available` | boolean \| null | `false` disables the choice |
| `lead_time` | string \| null | Stored only |

### Product.customizations[] (Customization) — personalisation

| Field | Type | Enum | Usage |
|---|---|---|---|
| `label` | string | | Key in form state; copied to order line |
| `type` | string | `text` `number` `select` `date` `checkbox` | Control type (`CustomizationFields.jsx`) |
| `price` | number | | Flat add-on when a value is provided |
| `options` | string[] | | Choices for `select` |
| `placeholder` | string \| null | | Input placeholder |
| `max_length` | number \| null | | `maxLength` on text inputs |

### Product.special_request (SpecialRequestConfig)

| Field | Type | Enum | Usage |
|---|---|---|---|
| `enabled` | boolean | | Shows the drawer on PDP |
| `message` | string | | Drawer title |
| `allow_images` | boolean | | Enables reference uploads |
| `max_images` | number | | Upload cap (default 3 in UI) |
| `payment_behaviour` | string | `immediate` `approval` `quote` | Non-`immediate` → cart line `requires_approval: true` → order `requires_approval`, `production_status: awaiting_approval`, no payment expected at checkout |

### Product.deposit (DepositConfig)

| Field | Type | Enum | Usage |
|---|---|---|---|
| `enabled` | boolean | | |
| `type` | string | `fixed` `percentage` | |
| `value` | number | | `fixed`: GBP capped at line total; `percentage`: % of unit total. Computed in `pricing.depositForItem` |

---

## Category

| Field | Type | Req | Default | Usage |
|---|---|---|---|---|
| `name` | string | ✔ | | |
| `slug` | string | | | Not currently used for routing (filter uses id) |
| `description` | string | | | |
| `image` | string | | | Home category grid tile |
| `sort_order` | number | | 0 | List ordering |
| `published` | boolean | | true | Storefront filter |
| `seo` | `{ title, description }` | | | Stored only |

No admin UI exists for categories (seeded via script).

## Collection

| Field | Type | Req | Default | Usage |
|---|---|---|---|---|
| `name` | string | ✔ | | |
| `slug` | string | | | Not used for routing |
| `description` | string | | | Featured collection card |
| `hero_image` | string | | | Featured collection card |
| `published` | boolean | | true | Storefront filter |
| `featured` | boolean | | false | Home "Featured Collections" (first 3) |
| `seo` | `{ title, description }` | | | Stored only |

No admin UI exists for collections.

---

## Order

Created anonymously at checkout; all money fields are GBP numbers computed **in the browser**.

| Field | Type | Req | Default | Enum | Usage |
|---|---|---|---|---|---|
| `order_number` | string | ✔ | | `AUR-<base36 ms>` | Display id |
| `customer_name` | string | | | | |
| `email` | string | ✔ | | | |
| `phone` | string | | | | |
| `billing_address` | Address | | | | |
| `shipping_address` | Address | | | | |
| `items` | OrderItem[] | | | | Full line snapshot |
| `subtotal` | number | | | | Σ line_total |
| `shipping_method` | string | | | name from `StoreSettings.shipping_methods` | |
| `shipping_cost` | number | | | | |
| `discount_code` | string | | | | |
| `discount_amount` | number | | | | |
| `tax_amount` | number | | | | VAT portion (informational when prices include tax) |
| `total` | number | | | | |
| `currency` | string | | `GBP` | | |
| `deposit_required` | number | | 0 | | Σ line deposits × qty |
| `amount_paid` | number | | 0 | | Updated by admin "Record payment" |
| `balance_due` | number | | 0 | | `total − amount_paid` |
| `requires_approval` | boolean | | false | | Any line with non-immediate special request |
| `payment_status` | string | | `pending` | `pending` `processing` `deposit_paid` `paid` `failed` `cancelled` `partially_refunded` `refunded` | Admin-editable; auto-set on payment record |
| `production_status` | string | | `awaiting_payment` | `awaiting_payment` `awaiting_approval` `confirmed` `in_production` `quality_check` `ready_to_dispatch` `dispatched` `delivered` `cancelled` | Admin-editable; independent of payment status |
| `payments` | Payment[] | | | | Timeline |
| `internal_notes` | `{ text, date }[]` | | | | Admin notes |

### Address
`{ line1, line2, city, postcode, country }` — all strings.

### Order.items[] (OrderItem)

| Field | Type | Usage |
|---|---|---|
| `product_id` | string → Product.id | |
| `name`, `image`, `sku` | string | Snapshot |
| `slug` | string | Present in cart lines (extra field, not in schema; ignored by Base44 validation) |
| `quantity` | number | |
| `unit_price` | number | Base unit price at time of order (sale price if active) |
| `options` | object `{ [optionName]: label \| true \| string \| number }` | Selected variants |
| `options_price` | number | Extra field from cart: Σ modifiers |
| `customizations` | `{ label, value, price }[]` | |
| `special_request` | `{ text, images: string[], payment_behaviour }` \| null | |
| `unit_total` | number | Extra field from cart: base + options + customisations |
| `line_total` | number | `unit_total × quantity` |
| `deposit` | number | Extra field from cart: per-unit deposit |
| `requires_approval` | boolean | Extra field from cart |

> Fields marked "extra" are written by the cart but not declared in the Order schema. Base44
> persists them anyway. Include them in the new schema.

### Order.payments[] (Payment)

| Field | Type | Enum |
|---|---|---|
| `type` | string | `full` `deposit` `balance` `additional_charge` `refund` |
| `amount` | number | |
| `status` | string | free text; UI writes `succeeded` or `requested` |
| `provider` | string | UI writes `manual` |
| `reference` | string | e.g. Stripe id |
| `note` | string | |
| `date` | ISO string | |

---

## BespokeRequest

| Field | Type | Req | Default | Enum |
|---|---|---|---|---|
| `customer_name` | string | ✔ | | |
| `email` | string | ✔ | | |
| `phone` | string | | | |
| `jewellery_type` | string | | | Ring, Necklace, Bracelet, Earrings, Pendant, Anklet, Other (UI list) |
| `description` | string | | | |
| `inspiration` | string | | | |
| `materials` | string | | | |
| `stones` | string | | | |
| `approximate_size` | string | | | |
| `budget` | string | | | |
| `completion_date` | string (date) | | | |
| `reference_images` | string[] | | | Uploaded URLs, max 5 |
| `notes` | string | | | |
| `status` | string | | `new` | `new` `reviewing` `more_info` `quote_prepared` `quote_sent` `accepted` `deposit_required` `in_production` `ready` `completed` `declined` |
| `quote` | Quote | | | see below |
| `internal_notes` | `{ text, date }[]` | | | |

### BespokeRequest.quote

| Field | Type | Enum |
|---|---|---|
| `description`, `customisation`, `materials`, `stones`, `estimated_completion`, `notes` | string | |
| `price` | number | |
| `deposit_type` | string | `fixed` `percentage` |
| `deposit_value` | number | |

Quotes are stored only; there is no customer-facing acceptance or payment flow.

---

## DiscountCode

| Field | Type | Req | Default | Enum | Usage |
|---|---|---|---|---|---|
| `code` | string | ✔ | | uppercased on lookup | |
| `type` | string | | `percentage` | `percentage` `fixed` | |
| `value` | number | ✔ | | | % or GBP |
| `min_spend` | number | | 0 | | Against subtotal |
| `starts_at` | string (date-time) | | | | |
| `ends_at` | string (date-time) | | | | |
| `usage_limit` | number \| null | | | | |
| `usage_count` | number | | 0 | | Incremented client-side after order |
| `active` | boolean | | true | | |

No admin UI; seeded `WELCOME10`.

## StoreSettings (singleton — first record used)

| Field | Type | Default | Usage |
|---|---|---|---|
| `store_name` | string | `Aurora` | |
| `email`, `phone`, `address` | string | | Admin only (footer is hard-coded) |
| `currency` | string | `GBP` | Copied to order |
| `currency_symbol` | string | `£` | Checkout formatting |
| `tax_rate` | number | 20 | VAT % |
| `prices_include_tax` | boolean | true | Changes VAT maths (see SERVER_REQUIREMENTS) |
| `instagram`, `facebook`, `tiktok` | string | | Stored only |
| `shipping_methods` | `{ name, price, estimate, free_over: number\|null }[]` | | Checkout delivery options |
| `stripe_enabled` | boolean | false | **No effect** |
| `stripe_test_mode` | boolean | true | **No effect** |

## NewsletterSubscriber

| Field | Type | Req |
|---|---|---|
| `email` | string | ✔ |

No de-duplication.

## User (Base44 built-in)

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `email` | string | |
| `full_name` | string | |
| `role` | string | `admin` \| `user`. `admin` unlocks `/admin`. |
| `created_date` | string | |

Credentials, OAuth links and email-verification state are held by Base44 and **cannot be
exported**.