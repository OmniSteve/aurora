import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2 } from 'lucide-react';

// Loaded once per page load, not per render -- loadStripe() memoizes the
// script/instance itself, but this keeps it out of the render path too.
// VITE_STRIPE_PUBLISHABLE_KEY is public/non-secret by design (Stripe's own
// terminology for it), unlike VITE_-prefixed vars carrying real secrets,
// which this codebase has none of -- see .env.
const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

// Wraps @stripe/react-stripe-js's Elements/PaymentElement -- this is the
// entire payment UI. No raw card fields are ever rendered or touched by
// Aurora code (instruction: "do not collect or transmit raw card data
// through Aurora"); Apple Pay/Google Pay appear automatically inside
// PaymentElement whenever the browser/device supports them -- there is no
// separate wallet integration here.
export default function StripePaymentForm({ clientSecret, returnUrl, onError }) {
  if (!stripePromise) {
    return <p className="text-destructive text-sm" role="alert">Payment is not configured. Please contact us to complete this order.</p>;
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
      <PaymentForm returnUrl={returnUrl} onError={onError} />
    </Elements>
  );
}

function PaymentForm({ returnUrl, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setMessage('');

    // confirmPayment handles 3DS/redirect-required methods itself; for
    // those it navigates the browser away and back to `returnUrl`. For
    // methods that resolve without a redirect, it resolves here instead --
    // either way, OrderConfirmation.jsx re-fetches the order rather than
    // trusting anything about how we got there (instruction: "never trust
    // the browser redirect as payment confirmation").
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });

    if (error) {
      setMessage(error.message || 'Payment could not be completed. Please try again.');
      setSubmitting(false);
      onError?.(error);
    }
    // No success branch needed here -- a non-redirect success still ends
    // with Stripe internally settling the PaymentIntent, and the caller
    // navigates to order confirmation once this component reports done via
    // the redirect itself. If confirmPayment resolves without redirecting
    // and without an error, Stripe already completed the flow client-side;
    // navigate on to confirmation immediately.
    if (!error) window.location.href = returnUrl;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />
      {message && <p className="text-destructive text-sm" role="alert">{message}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full sm:w-auto px-12 bg-primary text-primary-foreground py-4 text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        Pay Now
      </button>
    </form>
  );
}
