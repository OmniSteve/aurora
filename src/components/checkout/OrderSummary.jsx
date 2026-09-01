import React from 'react';
import { formatPrice } from '@/lib/format';
import { Image } from '@/components/ui/image';

export default function OrderSummary({ items, totals, symbol = '£' }) {
  return (
    <aside className="bg-secondary/50 dark:bg-card p-6 md:p-8 h-fit" aria-label="Order summary">
      <h2 className="font-heading text-2xl mb-6">Order Summary</h2>
      <div className="space-y-5">
        {items.map((item) => (
          <div key={item.cart_id} className="flex gap-4">
            <div className="w-16 h-16 bg-muted flex-shrink-0">
              {item.image && <Image src={item.image} alt={item.name} className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <div className="flex justify-between gap-2">
                <p className="font-medium truncate">{item.name} × {item.quantity}</p>
                <p>{formatPrice(item.line_total, symbol)}</p>
              </div>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {Object.entries(item.options || {}).filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => (
                  <p key={k}>{k}: {v === true ? 'Yes' : v}</p>
                ))}
                {(item.customizations || []).map((c) => <p key={c.label}>{c.label}: {c.value}</p>)}
                {item.special_request?.text && <p className="text-primary">Special request attached</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hairline mt-6 pt-5 space-y-2.5 text-sm">
        <p className="flex justify-between"><span>Subtotal</span><span>{formatPrice(totals.subtotal, symbol)}</span></p>
        {totals.discount > 0 && (
          <p className="flex justify-between text-primary"><span>Discount{totals.discountCode ? ` (${totals.discountCode})` : ''}</span><span>−{formatPrice(totals.discount, symbol)}</span></p>
        )}
        <p className="flex justify-between"><span>Shipping</span><span>{totals.shipping === 0 ? 'Free' : formatPrice(totals.shipping, symbol)}</span></p>
        <p className="flex justify-between text-muted-foreground">
          <span>VAT{totals.taxIncluded ? ' (included)' : ''}</span><span>{formatPrice(totals.tax, symbol)}</span>
        </p>
        <p className="flex justify-between font-medium text-base hairline pt-3"><span>Total</span><span>{formatPrice(totals.total, symbol)}</span></p>
        {totals.depositDue > 0 && (
          <>
            <p className="flex justify-between text-primary"><span>Due today (deposit)</span><span>{formatPrice(totals.dueNow, symbol)}</span></p>
            <p className="flex justify-between text-muted-foreground"><span>Balance later</span><span>{formatPrice(totals.balanceLater, symbol)}</span></p>
          </>
        )}
      </div>
    </aside>
  );
}