import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '@/api/aurora';
import { useCart } from '@/components/cart/CartContext';
import { formatPrice, round2 } from '@/lib/format';
import OrderSummary from '@/components/checkout/OrderSummary';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const STEPS = ['Details', 'Delivery', 'Review & Payment'];

export default function Checkout() {
  const { items, subtotal, depositDue, requiresApproval, clearCart } = useCart();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    ship: { line1: '', line2: '', city: '', postcode: '', country: 'United Kingdom' },
    billSame: true,
    bill: { line1: '', line2: '', city: '', postcode: '', country: 'United Kingdom' },
    shippingMethod: '',
  });
  const [codeInput, setCodeInput] = useState('');
  const [discount, setDiscount] = useState(null);
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    api.settings.get().then((s) => {
      setSettings(s);
      if (s?.shipping_methods?.[0]) setForm((f) => ({ ...f, shippingMethod: s.shipping_methods[0].name }));
    });
  }, []);

  const symbol = settings?.currency_symbol || '£';

  const totals = useMemo(() => {
    const method = settings?.shipping_methods?.find((m) => m.name === form.shippingMethod);
    const shipping = method ? (method.free_over && subtotal >= method.free_over ? 0 : Number(method.price) || 0) : 0;
    const discountAmt = Math.min(discount?.amount || 0, subtotal);
    const taxRate = settings?.tax_rate ?? 20;
    const taxIncluded = settings?.prices_include_tax !== false;
    const taxable = Math.max(0, subtotal - discountAmt);
    const tax = taxIncluded ? (taxable * taxRate) / (100 + taxRate) : (taxable * taxRate) / 100;
    const total = taxable + shipping + (taxIncluded ? 0 : tax);
    const dueNow = depositDue > 0 ? Math.min(depositDue + shipping, total) : total;
    return {
      subtotal: round2(subtotal),
      shipping: round2(shipping),
      discount: round2(discountAmt),
      discountCode: discount?.code,
      tax: round2(tax),
      taxIncluded,
      total: round2(total),
      depositDue: round2(depositDue),
      dueNow: round2(dueNow),
      balanceLater: round2(total - dueNow),
      methodName: method?.name || '',
    };
  }, [settings, form.shippingMethod, subtotal, discount, depositDue]);

  if (!items.length) {
    return (
      <div className="text-center py-32">
        <h1 className="text-3xl font-light">Nothing to check out</h1>
        <Link to="/shop" className="text-primary text-sm mt-4 inline-block">Return to the shop</Link>
      </div>
    );
  }

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setShip = (k, v) => setForm((f) => ({ ...f, ship: { ...f.ship, [k]: v } }));
  const setBill = (k, v) => setForm((f) => ({ ...f, bill: { ...f.bill, [k]: v } }));

  const next = () => {
    setError('');
    if (step === 0) {
      if (!form.name.trim() || !form.email.includes('@')) return setError('Please enter your name and a valid email address.');
      if (!form.ship.line1.trim() || !form.ship.city.trim() || !form.ship.postcode.trim()) return setError('Please complete your shipping address.');
      if (!form.billSame && (!form.bill.line1.trim() || !form.bill.city.trim() || !form.bill.postcode.trim())) return setError('Please complete your billing address.');
    }
    if (step === 1 && !form.shippingMethod) return setError('Please choose a delivery method.');
    setStep(step + 1);
  };

  const applyCode = async () => {
    setCodeError('');
    if (!codeInput.trim()) return;
    const result = await api.discounts.validate(codeInput, subtotal);
    if (!result.valid) { setDiscount(null); setCodeError(result.reason); return; }
    setDiscount({ code: result.record.code, amount: result.amount, record: result.record });
  };

  const placeOrder = async () => {
    setPlacing(true);
    setError('');
    try {
      const order = await api.orders.create({
        order_number: `AUR-${Date.now().toString(36).toUpperCase()}`,
        customer_name: form.name,
        email: form.email,
        phone: form.phone,
        shipping_address: form.ship,
        billing_address: form.billSame ? form.ship : form.bill,
        items: items.map(({ cart_id, ...rest }) => rest),
        subtotal: totals.subtotal,
        shipping_method: totals.methodName,
        shipping_cost: totals.shipping,
        discount_code: discount?.code || '',
        discount_amount: totals.discount,
        tax_amount: totals.tax,
        total: totals.total,
        currency: settings?.currency || 'GBP',
        deposit_required: totals.depositDue,
        amount_paid: 0,
        balance_due: totals.total,
        requires_approval: requiresApproval,
        payment_status: 'pending',
        production_status: requiresApproval ? 'awaiting_approval' : 'awaiting_payment',
        payments: [],
        internal_notes: [],
      });
      if (discount?.record) await api.discounts.markUsed(discount.record);
      clearCart();
      navigate(`/order-confirmation/${order.id}`);
    } catch (e) {
      setError('We could not place your order. Please try again.');
      setPlacing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-14">
      <h1 className="text-4xl md:text-5xl font-light mb-10">Checkout</h1>
      <ol className="flex gap-2 mb-12 text-xs uppercase tracking-luxe" aria-label="Checkout progress">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex-1 border-t-2 pt-3 ${i <= step ? 'border-primary text-foreground' : 'border-border text-muted-foreground'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12 items-start">
        <div className="space-y-8">
          {step === 0 && (
            <div className="space-y-6">
              <h2 className="font-heading text-2xl">Your Details</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Full name" required value={form.name} onChange={(v) => setField('name', v)} />
                <Field label="Email" type="email" required value={form.email} onChange={(v) => setField('email', v)} />
                <Field label="Phone (optional)" value={form.phone} onChange={(v) => setField('phone', v)} />
              </div>
              <h2 className="font-heading text-2xl pt-4">Shipping Address</h2>
              <AddressFields value={form.ship} onChange={setShip} prefix="ship" />
              <div className="flex items-center gap-3">
                <Checkbox id="bill-same" checked={form.billSame} onCheckedChange={(c) => setField('billSame', c === true)} />
                <label htmlFor="bill-same" className="text-sm">Billing address is the same as shipping</label>
              </div>
              {!form.billSame && (
                <>
                  <h2 className="font-heading text-2xl pt-2">Billing Address</h2>
                  <AddressFields value={form.bill} onChange={setBill} prefix="bill" />
                </>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <h2 className="font-heading text-2xl">Delivery Method</h2>
              {!settings?.shipping_methods?.length ? (
                <p className="text-muted-foreground text-sm">Loading delivery options…</p>
              ) : (
                <RadioGroup value={form.shippingMethod} onValueChange={(v) => setField('shippingMethod', v)} className="space-y-3">
                  {settings.shipping_methods.map((m) => {
                    const free = m.free_over && subtotal >= m.free_over;
                    return (
                      <label key={m.name} className={`flex items-center justify-between border p-4 cursor-pointer transition-colors ${form.shippingMethod === m.name ? 'border-primary' : 'border-border'}`}>
                        <span className="flex items-center gap-3">
                          <RadioGroupItem value={m.name} id={`ship-${m.name}`} />
                          <span>
                            <span className="block text-sm font-medium">{m.name}</span>
                            {m.estimate && <span className="block text-xs text-muted-foreground">{m.estimate}</span>}
                          </span>
                        </span>
                        <span className="text-sm">{free || !Number(m.price) ? 'Free' : formatPrice(m.price, symbol)}</span>
                      </label>
                    );
                  })}
                </RadioGroup>
              )}
              <h2 className="font-heading text-2xl pt-4">Discount Code</h2>
              <div className="flex gap-3 max-w-sm">
                <Input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="e.g. WELCOME10" aria-label="Discount code" />
                <button onClick={applyCode} className="px-6 border border-border text-xs uppercase tracking-luxe hover:border-primary transition-colors">Apply</button>
              </div>
              {codeError && <p className="text-destructive text-sm" role="alert">{codeError}</p>}
              {discount && <p className="text-primary text-sm" role="status">Code {discount.code} applied — you save {formatPrice(discount.amount, symbol)}</p>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="font-heading text-2xl">Review & Payment</h2>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p><span className="text-foreground">{form.name}</span> · {form.email}{form.phone && ` · ${form.phone}`}</p>
                <p>Ship to: {form.ship.line1}, {form.ship.city}, {form.ship.postcode}, {form.ship.country}</p>
                <p>Delivery: {totals.methodName}</p>
              </div>
              {requiresApproval ? (
                <div className="border border-primary/40 bg-primary/5 p-5 text-sm leading-relaxed">
                  Your order includes a special request. Aurora will review it first — <strong>no payment is taken now</strong>.
                  Once approved, we'll send you secure payment instructions by email.
                </div>
              ) : (
                <div className="border border-border p-5 text-sm leading-relaxed text-muted-foreground">
                  Amount payable {totals.depositDue > 0 ? `today: ${formatPrice(totals.dueNow, symbol)} (deposit)` : `: ${formatPrice(totals.total, symbol)}`}.
                  Secure card payment (Stripe) is the next step being connected to this store — your order will be
                  recorded as <strong>awaiting payment</strong> and we'll send secure payment instructions by email.
                </div>
              )}
              {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
              <button
                onClick={placeOrder}
                disabled={placing}
                className="w-full sm:w-auto px-12 bg-primary text-primary-foreground py-4 text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {placing && <Loader2 className="w-4 h-4 animate-spin" />}
                Place Order — {formatPrice(totals.dueNow, symbol)}
              </button>
            </div>
          )}

          {error && step < 2 && <p className="text-destructive text-sm" role="alert">{error}</p>}
          <div className="flex gap-4 pt-2">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="px-8 py-3 border border-border text-xs uppercase tracking-luxe hover:border-foreground transition-colors">
                Back
              </button>
            )}
            {step < 2 && (
              <button onClick={next} className="px-10 py-3 bg-foreground text-background text-xs uppercase tracking-luxe hover:bg-primary hover:text-primary-foreground transition-colors">
                Continue
              </button>
            )}
          </div>
        </div>

        <OrderSummary items={items} totals={totals} symbol={symbol} />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required }) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <Label htmlFor={id} className="text-xs uppercase tracking-luxe text-muted-foreground">{label}</Label>
      <Input id={id} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5" />
    </div>
  );
}

function AddressFields({ value, onChange, prefix }) {
  const f = (key, label, span) => (
    <div className={span ? 'sm:col-span-2' : ''}>
      <Label htmlFor={`${prefix}-${key}`} className="text-xs uppercase tracking-luxe text-muted-foreground">{label}</Label>
      <Input id={`${prefix}-${key}`} value={value[key]} onChange={(e) => onChange(key, e.target.value)} className="mt-1.5" />
    </div>
  );
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {f('line1', 'Address line 1', true)}
      {f('line2', 'Address line 2 (optional)', true)}
      {f('city', 'City')}
      {f('postcode', 'Postcode')}
      {f('country', 'Country', true)}
    </div>
  );
}