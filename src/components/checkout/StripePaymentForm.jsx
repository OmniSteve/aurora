import React, { useEffect, useState } from 'react';
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

// Mirrors the storefront's actual palette (src/index.css's .aurora-storefront/
// .dark .aurora-storefront blocks) as literal color values -- Stripe's
// Appearance API renders inside a cross-origin iframe, which cannot read
// Aurora's CSS custom properties, so these can't be `var(--foreground)`
// references; they're kept in sync by hand with index.css instead. Updated
// alongside the "premium crystal & gemstone atelier" redesign so the
// payment form's warm ivory/charcoal tones match the surrounding page
// rather than the previous palette's cooler tones.
const LIGHT_APPEARANCE = {
  theme: 'stripe',
  variables: {
    colorPrimary: 'hsl(36, 42%, 52%)',
    colorBackground: 'hsl(40, 30%, 98%)',
    colorText: 'hsl(20, 14%, 13%)',
    colorTextSecondary: 'hsl(24, 10%, 38%)',
    colorTextPlaceholder: 'hsl(24, 10%, 46%)',
    colorDanger: 'hsl(6, 65%, 46%)',
    colorIcon: 'hsl(24, 10%, 38%)',
    borderRadius: '2px',
  },
  rules: {
    '.Label': { color: 'hsl(20, 14%, 13%)' },
    '.Input': { color: 'hsl(20, 14%, 13%)', backgroundColor: 'hsl(40, 30%, 98%)', border: '1px solid hsl(30, 16%, 86%)' },
    '.Input::placeholder': { color: 'hsl(24, 10%, 46%)' },
    '.Tab': { color: 'hsl(24, 10%, 38%)', border: '1px solid hsl(30, 16%, 86%)', backgroundColor: 'hsl(40, 30%, 98%)' },
    '.Tab--selected': { color: 'hsl(20, 14%, 13%)', borderColor: 'hsl(36, 42%, 52%)' },
    '.Error': { color: 'hsl(6, 65%, 46%)' },
  },
};

// 'night' as the base (Stripe's own dark-optimized preset) plus explicit
// overrides -- the preset alone still left some label/secondary text too
// close to Aurora's near-black background, so every text role called out
// in the fix is pinned to a color already checked against Aurora's actual
// dark input surface (colorBackground below), not the page background.
// colorDanger is intentionally brighter than index.css's own --destructive
// dark value (which is closer to ~2.9:1 against a dark input) to clear
// WCAG's 4.5:1 text-contrast threshold here.
const DARK_APPEARANCE = {
  theme: 'night',
  variables: {
    colorPrimary: 'hsl(38, 48%, 58%)',
    colorBackground: 'hsl(22, 9%, 16%)',
    colorText: 'hsl(36, 22%, 92%)',
    colorTextSecondary: 'hsl(32, 12%, 64%)',
    colorTextPlaceholder: 'hsl(32, 12%, 55%)',
    colorDanger: 'hsl(6, 65%, 66%)',
    colorIcon: 'hsl(32, 12%, 64%)',
    borderRadius: '2px',
  },
  rules: {
    '.Label': { color: 'hsl(36, 22%, 92%)' },
    '.Input': { color: 'hsl(36, 22%, 92%)', backgroundColor: 'hsl(22, 9%, 16%)', border: '1px solid hsl(22, 9%, 26%)' },
    '.Input::placeholder': { color: 'hsl(32, 12%, 55%)' },
    '.Tab': { color: 'hsl(32, 12%, 64%)', border: '1px solid hsl(22, 9%, 26%)', backgroundColor: 'hsl(22, 9%, 16%)' },
    '.Tab--selected': { color: 'hsl(36, 22%, 92%)', borderColor: 'hsl(38, 48%, 58%)' },
    '.Error': { color: 'hsl(6, 65%, 66%)' },
  },
};

// Reads Aurora's existing theme mechanism (lib/theme.js toggles a `dark`
// class on <html>) reactively, without adding a second theme system --
// ThemeToggle.jsx already owns writing that class; this only observes it,
// so it also picks up the OS-level default applied by lib/theme.js's
// prefers-color-scheme fallback on first load.
function useIsDarkMode() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(el.classList.contains('dark')));
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

// Wraps @stripe/react-stripe-js's Elements/PaymentElement -- this is the
// entire payment UI. No raw card fields are ever rendered or touched by
// Aurora code (instruction: "do not collect or transmit raw card data
// through Aurora"); Apple Pay/Google Pay appear automatically inside
// PaymentElement whenever the browser/device supports them -- there is no
// separate wallet integration here.
export default function StripePaymentForm({ clientSecret, returnUrl, onError }) {
  const isDark = useIsDarkMode();

  if (!stripePromise) {
    return <p className="text-destructive text-sm" role="alert">Payment is not configured. Please contact us to complete this order.</p>;
  }
  return (
    // key={isDark} remounts Elements on a theme change -- appearance is
    // only read once at Elements creation, and this is Stripe's own
    // documented pattern for switching it. Card details typed before a
    // mid-entry theme toggle are lost, which is an acceptable tradeoff for
    // an edge case against always getting a correctly-themed field.
    <Elements key={isDark ? 'dark' : 'light'} stripe={stripePromise} options={{ clientSecret, appearance: isDark ? DARK_APPEARANCE : LIGHT_APPEARANCE }}>
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
