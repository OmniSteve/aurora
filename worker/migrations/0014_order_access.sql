-- Opaque anonymous order-access token (instruction: "do not expose customer/
-- order data through an anonymous GET /api/orders/:id solely because
-- someone knows an order id"). Order ids are already unguessable UUIDs,
-- but the id is also the thing printed on-screen and put in the URL right
-- after checkout, so it shouldn't double as a credential. A separate
-- random token, only ever returned once (in the order-creation response),
-- is what GET /api/orders/:id accepts from an anonymous caller -- hashed
-- at rest like every other bearer credential in this schema. Authenticated
-- callers instead need session ownership (orders.user_id match); NULL here
-- for any order created while signed in.
ALTER TABLE orders ADD COLUMN access_token_hash TEXT;
CREATE INDEX idx_orders_access_token ON orders(access_token_hash);
