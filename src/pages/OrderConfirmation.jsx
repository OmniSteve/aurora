import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/api/aurora';
import { formatPrice } from '@/lib/format';
import StripePaymentForm from '@/components/checkout/StripePaymentForm';

// PaymentIntent statuses that mean "nothing has been charged yet, the
// customer needs to act" -- as opposed to 'processing' (already submitted,
// just waiting) or 'succeeded' (payment_status will already say 'paid').
const RETRYABLE_INTENT_STATUSES = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

function PaymentAction({ order, accessToken, onPaid }) {
  const [intent, setIntent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startPayment = async () => {
    setLoading(true);
    setError('');
    try {
      setIntent(await api.payments.createIntent(order.id, accessToken));
    } catch (e) {
      setError(e.message || 'We could not start payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (order.requires_approval || order.payment_status === 'paid' || order.payment_status === 'refunded') return null;

  if (intent) {
    const returnUrl = `${window.location.origin}/order-confirmation/${order.id}${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''}`;
    return (
      <div className="border border-border p-5 mt-8 text-left space-y-4">
        <p className="text-sm text-muted-foreground">{intent.purpose === 'balance' ? 'Pay remaining balance' : 'Complete your payment'} — {formatPrice(intent.amount)}</p>
        <StripePaymentForm clientSecret={intent.client_secret} returnUrl={returnUrl} onError={(e) => setError(e.message)} />
        {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
      </div>
    );
  }

  const isBalance = order.payment_status === 'deposit_paid' && order.balance_due > 0;
  const isProcessing = order.payment_intent_status === 'processing';

  return (
    <div className="border border-border p-5 mt-8 text-sm leading-relaxed text-left space-y-3">
      {isProcessing ? (
        <p className="text-muted-foreground">Your payment is processing — this can take a moment. We'll email you once it's confirmed.</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            {isBalance
              ? `A balance of ${formatPrice(order.balance_due)} remains on this order.`
              : order.payment_intent_status && !RETRYABLE_INTENT_STATUSES.has(order.payment_intent_status)
                ? 'Your order is awaiting payment.'
                : 'Your payment was not completed.'}
          </p>
          <button
            onClick={startPayment}
            disabled={loading}
            className="px-10 py-3 bg-primary text-primary-foreground text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-60 inline-flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isBalance ? 'Pay Balance' : 'Complete Payment'}
          </button>
        </>
      )}
      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
    </div>
  );
}

export default function OrderConfirmation() {
  const { id } = useParams();
  // The order id alone is never sufficient to view an anonymous order --
  // this token (minted once, at order creation) is the actual credential.
  // See worker/src/routes/orders.js.
  const [searchParams] = useSearchParams();
  const accessToken = searchParams.get('token');
  const [order, setOrder] = useState(undefined);

  const reload = () => api.orders.get(id, accessToken).then(setOrder).catch(() => setOrder(null));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, accessToken]);

  if (order === undefined) return <div className="py-32 text-center text-muted-foreground">Loading your order…</div>;
  if (!order) {
    return (
      <div className="py-32 text-center">
        <h1 className="text-3xl font-light">Order not found</h1>
        <Link to="/" className="text-primary text-sm mt-4 inline-block">Return home</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      <CheckCircle2 className="w-12 h-12 text-primary mx-auto" aria-hidden="true" />
      <h1 className="text-4xl font-light mt-6">Thank you, {order.customer_name?.split(' ')[0]}</h1>
      <p className="text-muted-foreground mt-3">
        Your order <span className="text-foreground font-medium">{order.order_number}</span> has been received.
        A confirmation has been sent to {order.email}.
      </p>

      {order.requires_approval ? (
        <div className="border border-primary/40 bg-primary/5 p-5 mt-8 text-sm leading-relaxed text-left">
          Your order includes a special request. Our atelier will review it and contact you before any payment is taken.
        </div>
      ) : order.payment_status === 'paid' ? (
        <div className="border border-primary/40 bg-primary/5 p-5 mt-8 text-sm leading-relaxed text-left">
          Payment received — thank you. Your order is now <strong className="text-foreground">confirmed</strong>.
        </div>
      ) : null}

      <PaymentAction order={order} accessToken={accessToken} onPaid={reload} />

      <div className="text-left mt-10 space-y-4">
        {(order.items || []).map((item, i) => (
          <div key={i} className="flex justify-between text-sm hairline pt-4 first:border-t-0 first:pt-0">
            <div>
              <p className="font-medium">{item.name} × {item.quantity}</p>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {Object.entries(item.options || {}).filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => (
                  <p key={k}>{k}: {v === true ? 'Yes' : v}</p>
                ))}
                {(item.customizations || []).map((c) => <p key={c.label}>{c.label}: {c.value}</p>)}
                {item.special_request?.text && <p className="text-primary">Special request attached</p>}
              </div>
            </div>
            <p>{formatPrice(item.line_total)}</p>
          </div>
        ))}
        <div className="hairline pt-4 space-y-1.5 text-sm">
          <p className="flex justify-between text-muted-foreground"><span>Shipping ({order.shipping_method})</span><span>{order.shipping_cost ? formatPrice(order.shipping_cost) : 'Free'}</span></p>
          {order.discount_amount > 0 && <p className="flex justify-between text-primary"><span>Discount</span><span>−{formatPrice(order.discount_amount)}</span></p>}
          <p className="flex justify-between font-medium text-base"><span>Total</span><span>{formatPrice(order.total)}</span></p>
          {order.deposit_required > 0 && (
            <p className="flex justify-between text-primary"><span>Deposit due</span><span>{formatPrice(order.deposit_required)}</span></p>
          )}
        </div>
      </div>

      <Link to="/shop" className="inline-block mt-12 px-10 py-4 border border-border text-xs uppercase tracking-luxe hover:border-primary transition-colors">
        Continue Shopping
      </Link>
    </div>
  );
}