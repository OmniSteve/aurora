# Aurora — Stripe / Payments Status

## Summary

**Stripe is NOT integrated. No payment of any kind is processed by this application.**

Orders are recorded with `payment_status: 'pending'` and the customer is told that payment
instructions will follow by email (no email is sent either).

## What exists

| Item | Status | Detail |
|---|---|---|
| `@stripe/stripe-js ^5.2.0` | Installed, **never imported** | Listed in `package.json` only |
| `@stripe/react-stripe-js ^3.0.0` | Installed, **never imported** | Listed in `package.json` only |
| Checkout UI | Exists, no payment step | `src/pages/Checkout.jsx` — 3 steps (Details, Delivery, Review & Payment). Step 3 shows copy: "Secure card payment (Stripe) is the next step being connected to this store — your order will be recorded as awaiting payment". The button "Place Order — £X" creates the Order record and redirects to `/order-confirmation/:id`. |
| `Order.payment_status` | Exists | enum `pending` `processing` `deposit_paid` `paid` `failed` `cancelled` `partially_refunded` `refunded`. Set to `pending` at checkout; admin can change freely; auto-set to `deposit_paid`/`paid` when admin records a manual payment. |
| `Order.production_status` | Exists, independent | `awaiting_payment` or `awaiting_approval` at creation, admin-driven thereafter. |
| `Order.deposit_required` | Exists | Client-side Σ(`pricing.depositForItem × qty`). |
| `Order.amount_paid` / `balance_due` | Exist | `0` / `total` at creation. Updated only by the admin "Record a payment / charge" form (`AdminOrderDetail.jsx`), which appends to `Order.payments[]` with `provider: 'manual'`. |
| `Order.payments[]` | Exists | Manual timeline entries: `full`, `deposit`, `balance`, `additional_charge`. `refund` type exists in the schema but there is no UI to create one. |
| `StoreSettings.stripe_enabled`, `stripe_test_mode` | Stored flags | **Read by nothing.** Toggling them changes no behaviour. Admin Settings shows a notice that Stripe is not connected. |
| Stripe API keys / webhook secret | **None** | No secrets are configured anywhere. |

## What is missing (all of it)

| Capability | Status |
|---|---|
| Stripe PaymentIntent creation | Not implemented |
| Stripe Elements / Payment Element in checkout | Not implemented |
| Server-side price calculation before charging | Not implemented — totals are computed in the browser (see `SERVER_REQUIREMENTS.md`) |
| Webhook handler (`payment_intent.succeeded`, `charge.refunded`, …) | Not implemented |
| Idempotent order ↔ payment linkage (`payment_intent_id` on Order) | No field exists |
| Deposit payment via Stripe | Not implemented (deposit amount is only displayed) |
| Balance-payment request flow (email link to pay remaining balance) | Not implemented |
| Additional-charge payment request | Not implemented (admin can log an `additional_charge` with status `requested`, nothing is sent) |
| Refunds / partial refunds | Not implemented |
| Customer receipts / payment confirmation emails | Not implemented |
| Bespoke quote acceptance → deposit payment | Not implemented (quote is stored only) |
| Special-request approval → payment link | Not implemented |
| Test vs live mode switching | Flag only |

## Intended design (documented for the next developer; nothing built)

1. `POST /api/orders` — server validates cart, recomputes totals, creates order, returns
   `client_secret` of a PaymentIntent for `dueNow` (deposit or full). Orders with
   `requires_approval` skip the intent.
2. Checkout step 3 mounts Stripe Payment Element with that secret.
3. Webhook `payment_intent.succeeded` → append `payments[]` entry, set `amount_paid`,
   `balance_due`, `payment_status` (`deposit_paid` or `paid`), `production_status: confirmed`,
   decrement stock, send confirmation email.
4. Admin "Request balance" → PaymentIntent for `balance_due` + emailed link.
5. Refunds via Stripe API → `payments[]` type `refund`, `payment_status` `partially_refunded`/`refunded`.

## Cleanup option

If the new platform will not use Stripe's React libraries directly, remove
`@stripe/stripe-js` and `@stripe/react-stripe-js` from `package.json` — nothing imports them.