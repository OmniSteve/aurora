-- Extends inventory_reservations and discount_reservations to support the
-- full Stripe payment lifecycle safely, without implementing that lifecycle
-- yet (that lands in Phase 7 alongside the rest of Stripe).
--
-- The danger this schema must not preclude a fix for:
--
--   reservation expires -> stock released -> stock sold to somebody else
--   -> the ORIGINAL Stripe PaymentIntent (delayed webhook, slow bank
--   redirect, retried delivery) succeeds AFTER the release -> oversell.
--
-- A sweep that blindly does "expires_at < now => release" cannot tell this
-- case apart from a genuinely abandoned checkout, because expiry alone says
-- nothing about whether Stripe still intends to confirm the payment. The
-- columns added here give a future sweep what it needs to check first:
--
--   * stripe_payment_intent_id -- once checkout creates the PaymentIntent,
--     the reservation is linked to it. Before releasing an expired
--     reservation, the sweep must look up that intent's *current* status
--     with Stripe (or via a cached webhook-driven status) rather than
--     trusting local expiry alone. If Stripe still shows the intent as
--     succeeded/processing, the reservation must be committed (or left
--     alone), not released.
--   * committed_at / released_at -- record which terminal transition
--     actually happened and when, for audit and for making that
--     transition idempotent (a sweep that crashes mid-way must be able to
--     tell, on retry, whether it already committed or released a given row).
--
-- The status vocabulary (active/committed/released/expired) is not
-- necessarily final -- Phase 7 may introduce an intermediate state such as
-- 'pending_release' once the exact sweep algorithm (flip to pending,
-- verify with Stripe, then commit or release) is implemented. That is a
-- CHECK-constraint change for a future migration; nothing here blocks it.

ALTER TABLE inventory_reservations ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE inventory_reservations ADD COLUMN committed_at TEXT;
ALTER TABLE inventory_reservations ADD COLUMN released_at TEXT;
CREATE INDEX idx_inventory_reservations_intent ON inventory_reservations(stripe_payment_intent_id);

ALTER TABLE discount_reservations ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE discount_reservations ADD COLUMN committed_at TEXT;
ALTER TABLE discount_reservations ADD COLUMN released_at TEXT;
CREATE INDEX idx_discount_reservations_intent ON discount_reservations(stripe_payment_intent_id);
