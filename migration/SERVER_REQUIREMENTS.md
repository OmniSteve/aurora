# Aurora — Logic That Must Move Server-Side

Everything below currently executes in the browser and its results are written to the database
verbatim. The replacement backend must recompute all of it and treat client-supplied money
fields as untrusted. Source files are cited so the behaviour can be reproduced exactly.

## 1. Product pricing (`src/lib/pricing.js`)

```
baseUnitPrice(product) = sale_price if (sale_price != null && sale_price !== '') else price
```
Note: the UI shows a strikethrough only when `sale_price < price`, but `baseUnitPrice` uses
`sale_price` whenever it is set — even if higher. Replicate or fix deliberately.

## 2. Variant price modifiers (`optionsPrice`)

For each `product.options[]` entry with a selected value `v = selections[option.name]`
(skip when `v` is `null`, `''`, or `false`):

* If `option.type ∈ {dropdown, buttons, swatches, radio}`: find `values[].label === v`, add its
  `price_modifier` (0 if not found).
* Else (`checkbox`, `text`, `number`): add `values[0].price_modifier` (0 if absent).

Availability (`values[].available === false`) is only enforced in the UI control.
Required options are validated only in the UI at add-to-cart.

## 3. Customisation pricing (`customizationsPrice`)

For each `product.customizations[]` with a provided value (not `null`/`''`/`false`), add
`customization.price`. Value content (length, select membership, date validity) is not validated
beyond `maxLength` on the input.

## 4. Unit and line totals

```
unit_total  = baseUnitPrice + optionsPrice + customizationsPrice
line_total  = round2(unit_total × quantity)
```
`quantity ≥ 1` enforced in cart. `round2(n) = Math.round(n*100)/100`.

## 5. Deposits (`depositForItem`)

If `product.deposit.enabled`:
```
fixed:      min(deposit.value, unit_total)
percentage: unit_total × deposit.value / 100
```
rounded to 2dp, per unit. Cart `depositDue = Σ deposit × quantity` (`CartContext.jsx`).

## 6. Special-request approval flag

Cart line `requires_approval = !!special_request.text && product.special_request.payment_behaviour !== 'immediate'`.
Order `requires_approval = any line requires_approval`.
Order `production_status = requires_approval ? 'awaiting_approval' : 'awaiting_payment'`.
When `requires_approval`, no payment is expected at checkout (`dueNow` is still computed but
the UI says nothing is charged).

## 7. Discount validation (`api.discounts.validate` in `src/api/aurora.js`)

Client fetches `DiscountCode` where `code = input.trim().toUpperCase()` and `active = true`,
then checks in order:

1. no match → "Invalid discount code"
2. `starts_at` in future → "This code is not active yet"
3. `ends_at` in past → "This code has expired"
4. `usage_limit && usage_count ≥ usage_limit` → "This code has reached its usage limit"
5. `min_spend && subtotal < min_spend` → "Minimum spend of £{min_spend} required"

```
amount = type === 'percentage' ? subtotal × value / 100 : min(value, subtotal)   (round2)
```
Only one code per order. After the order is created, the client calls `markUsed` which sets
`usage_count = usage_count + 1` (read-modify-write, not atomic). Move into order creation.

## 8. Shipping (`Checkout.jsx` → `totals`)

Selected method `m` from `StoreSettings.shipping_methods` by `name`:
```
shipping = (m.free_over && subtotal ≥ m.free_over) ? 0 : Number(m.price) || 0
```
`subtotal` here is **before** discount. Default method = first in list.

## 9. Discount cap, tax / VAT and total (`Checkout.jsx`)

```
discountAmt = min(discount.amount, subtotal)
taxRate     = settings.tax_rate ?? 20
taxIncluded = settings.prices_include_tax !== false
taxable     = max(0, subtotal − discountAmt)
tax         = taxIncluded ? taxable × taxRate / (100 + taxRate)   // VAT portion embedded
                          : taxable × taxRate / 100                // VAT added on top
total       = taxable + shipping + (taxIncluded ? 0 : tax)
```
Shipping is never taxed. Stored: `subtotal`, `shipping_cost`, `discount_amount`, `tax_amount`,
`total` (all round2).

## 10. Amount due now / balance

```
dueNow       = depositDue > 0 ? min(depositDue + shipping, total) : total
balanceLater = total − dueNow
```
Stored on order: `deposit_required = depositDue`, `amount_paid = 0`, `balance_due = total`.
(Note `balance_due` is set to `total`, not `total − dueNow`, because nothing is paid yet.)

## 11. Order number

`AUR-${Date.now().toString(36).toUpperCase()}` — generated client-side, not unique under
concurrency. Generate server-side (sequence or ULID).

## 12. Order line snapshot

Client sends the whole cart line (see DATA_MODEL → OrderItem) including `unit_price`,
`options_price`, `unit_total`, `line_total`, `deposit`. Server should re-derive these from the
current product record and reject mismatches (or silently recompute).

## 13. Inventory

**No inventory logic exists.** `stock_quantity` and `availability` are display-only and never
change on purchase. Required server-side: decrement on paid order, block purchase when
`availability = out_of_stock` or `stock_quantity ≤ 0` for stock-controlled items, optionally
auto-set `low_stock`.

## 14. Admin authorisation

* UI gate only: `AdminLayout.jsx` checks `user.role === 'admin'`; `ProtectedRoute` requires a
  session. `App.jsx` nests `/admin/*` under `ProtectedRoute`.
* **Base44 enforces nothing per entity** (no RLS configured). Any authenticated user could
  create/update/delete products, orders, settings via the SDK.
* Required server-side: `role = admin` for all `listAll`, `create`/`update`/`remove` of products,
  `orders.listAll/update`, `bespoke.listAll/update`, `settings.save`, `discounts.listAll`,
  `newsletter.listAll`, `users.listAll`, product image upload, data export.

## 15. Admin payment recording (`AdminOrderDetail.jsx → recordPayment`)

```
isCharge = type === 'additional_charge'
total    = isCharge ? round2(total + amount) : total
paid     = round2(amount_paid + (isCharge ? 0 : amount))
balance  = max(0, round2(total − paid))
payment_status (non-charge only) = balance ≤ 0 ? 'paid' : 'deposit_paid'
payments.push({ type, amount, status: isCharge ? 'requested' : 'succeeded', provider: 'manual', reference, date })
```
Should become a server mutation with an audit trail.

## 16. Stripe amount calculation (future)

When Stripe is added, the PaymentIntent amount must be `round(dueNow × 100)` pence computed
server-side from steps 1–10, never from the client. Currency from `StoreSettings.currency`.

## 17. Other client-side behaviours worth knowing

* Shop filtering, search, sort and material facet derivation run on the full published product
  list in the browser (`Shop.jsx`). Fine for a small catalogue; paginate/search server-side later.
* Dashboard statistics (`AdminDashboard.jsx`) aggregate all orders/products/bespoke in the browser.
* Settings singleton = first record returned by `list()`.
* Newsletter subscribe has no de-dup or validation beyond `includes('@')`.
* Bespoke form and checkout do only presence checks; add server validation.