import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useCart } from '@/components/cart/CartContext';
import { formatPrice, round2 } from '@/lib/format';
import Image from '@/components/ui/image';

export default function Cart() {
  const { items, updateQuantity, removeItem, subtotal, depositDue, requiresApproval } = useCart();
  const navigate = useNavigate();

  if (!items.length) {
    return (
      <div className="text-center py-32 px-6">
        <h1 className="text-4xl font-light">Your cart is empty</h1>
        <p className="text-muted-foreground mt-3">Discover something made just for you.</p>
        <Link to="/shop" className="inline-block mt-8 px-10 py-4 bg-primary text-primary-foreground text-xs uppercase tracking-luxe">
          Browse the Collection
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-14">
      <h1 className="text-4xl md:text-5xl font-light mb-12">Your Cart</h1>
      <div className="space-y-8">
        {items.map((item) => (
          <div key={item.cart_id} className="flex gap-5 hairline pt-8 first:pt-0 first:border-t-0">
            <Link to={`/product/${item.slug}`} className="w-24 h-24 md:w-32 md:h-32 bg-muted flex-shrink-0">
              {item.image && <Image src={item.image} alt={item.name} className="w-full h-full object-cover" />}
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-4">
                <Link to={`/product/${item.slug}`} className="font-heading text-xl hover:text-primary transition-colors">{item.name}</Link>
                <p className="whitespace-nowrap">{formatPrice(item.line_total)}</p>
              </div>
              <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                {Object.entries(item.options || {}).filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => (
                  <p key={k}>{k}: {v === true ? 'Yes' : v}</p>
                ))}
                {(item.customizations || []).map((c) => (
                  <p key={c.label}>{c.label}: {c.value}{c.price > 0 && ` (+${formatPrice(c.price)})`}</p>
                ))}
                {item.special_request?.text && (
                  <p className="text-primary">Special request: {item.special_request.text.slice(0, 80)}{item.special_request.text.length > 80 && '…'}</p>
                )}
                {item.deposit > 0 && <p>Deposit due today: {formatPrice(item.deposit * item.quantity)}</p>}
              </div>
              <div className="flex items-center gap-4 mt-4">
                <div className="flex items-center border border-border">
                  <button aria-label="Decrease quantity" className="px-3 py-1.5" onClick={() => updateQuantity(item.cart_id, item.quantity - 1)}>−</button>
                  <span className="w-8 text-center text-sm">{item.quantity}</span>
                  <button aria-label="Increase quantity" className="px-3 py-1.5" onClick={() => updateQuantity(item.cart_id, item.quantity + 1)}>+</button>
                </div>
                <button
                  aria-label={`Remove ${item.name}`}
                  onClick={() => removeItem(item.cart_id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hairline mt-12 pt-8 max-w-sm ml-auto space-y-3 text-sm">
        <p className="flex justify-between"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></p>
        {depositDue > 0 && (
          <>
            <p className="flex justify-between text-primary"><span>Deposit due today</span><span>{formatPrice(depositDue)}</span></p>
            <p className="flex justify-between text-muted-foreground"><span>Balance on completion</span><span>{formatPrice(round2(subtotal - depositDue))}</span></p>
          </>
        )}
        <p className="text-xs text-muted-foreground">Shipping, discounts and VAT are calculated at checkout.</p>
        {requiresApproval && (
          <p className="text-xs text-primary">
            Your order contains a special request that Aurora will review before payment is taken.
          </p>
        )}
        <button
          onClick={() => navigate('/checkout')}
          className="w-full mt-4 bg-primary text-primary-foreground py-4 text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors"
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}