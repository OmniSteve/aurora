import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '@/api/aurora';
import { formatPrice } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image } from '@/components/ui/image';

const PAY_STATUSES = ['pending', 'processing', 'deposit_paid', 'paid', 'failed', 'cancelled', 'partially_refunded', 'refunded'];
const PROD_STATUSES = ['awaiting_payment', 'awaiting_approval', 'confirmed', 'in_production', 'quality_check', 'ready_to_dispatch', 'dispatched', 'delivered', 'cancelled'];

export default function AdminOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [approveAmount, setApproveAmount] = useState('');
  const [busy, setBusy] = useState('');
  const [balanceSent, setBalanceSent] = useState(false);

  const load = () => {
    setError(null);
    api.orders.getAdmin(id).then(setOrder).catch((e) => setError(e.message || 'Failed to load order.'));
  };
  useEffect(() => { load(); }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/admin/orders" aria-label="Back to orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to orders
        </Link>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!order) return <p className="text-muted-foreground">Loading order…</p>;

  const update = async (patch) => { await api.orders.update(order.id, patch); load(); };

  const addNote = async () => {
    if (!note.trim()) return;
    await api.orders.addNote(order.id, note.trim());
    setNote('');
    load();
  };

  const approve = async () => {
    setBusy('approve');
    try {
      await api.orders.approve(order.id, approveAmount === '' ? undefined : Number(approveAmount));
      load();
    } finally {
      setBusy('');
    }
  };

  const reject = async () => {
    if (!window.confirm('Reject this order? The customer will not be charged.')) return;
    setBusy('reject');
    try {
      await api.orders.reject(order.id);
      load();
    } finally {
      setBusy('');
    }
  };

  const requestBalance = async () => {
    setBusy('balance');
    try {
      await api.orders.requestBalance(order.id);
      setBalanceSent(true);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link to="/admin/orders" aria-label="Back to orders" className="p-2 border border-border hover:border-primary transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl md:text-3xl font-light">{order.order_number}</h1>
          <p className="text-xs text-muted-foreground">{new Date(order.created_date).toLocaleString('en-GB')}</p>
        </div>
        {order.requires_approval && <Badge className="bg-primary text-primary-foreground">Special request — needs review</Badge>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border border-border p-5">
          <p className="text-[11px] uppercase tracking-luxe text-muted-foreground mb-2">Payment status</p>
          <Select value={order.payment_status} onValueChange={(v) => update({ payment_status: v })}>
            <SelectTrigger aria-label="Payment status"><SelectValue /></SelectTrigger>
            <SelectContent>{PAY_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replaceAll('_', ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="border-2 border-primary/50 p-5">
          <p className="text-[11px] uppercase tracking-luxe text-primary mb-2">Production status</p>
          <Select value={order.production_status} onValueChange={(v) => update({ production_status: v })}>
            <SelectTrigger aria-label="Production status"><SelectValue /></SelectTrigger>
            <SelectContent>{PROD_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replaceAll('_', ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {order.requires_approval && (
        <section className="border-2 border-primary/50 bg-primary/5 p-5 space-y-3">
          <h2 className="font-heading text-xl">Approval required</h2>
          <p className="text-sm text-muted-foreground">
            This order includes a special request and has not been charged yet. Confirm the amount payable (adjust it if the
            request changes the price) and approve to open it for payment, or reject to cancel it without charging the customer.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="approve-amount" className="text-xs uppercase tracking-luxe text-muted-foreground block mb-1.5">Payable amount (£)</label>
              <Input id="approve-amount" type="number" min="0" step="0.01" placeholder={String(order.total)} value={approveAmount}
                onChange={(e) => setApproveAmount(e.target.value)} className="w-40" />
            </div>
            <button onClick={approve} disabled={!!busy}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-60">
              {busy === 'approve' && <Loader2 className="w-4 h-4 animate-spin" />} Approve
            </button>
            <button onClick={reject} disabled={!!busy}
              className="px-6 py-2.5 border border-border text-xs uppercase tracking-luxe hover:border-destructive hover:text-destructive transition-colors disabled:opacity-60">
              Reject
            </button>
          </div>
        </section>
      )}

      <section className="border border-border p-5">
        <h2 className="font-heading text-xl mb-3">Customer</h2>
        <div className="text-sm space-y-1">
          <p>{order.customer_name} · <a href={`mailto:${order.email}`} className="text-primary">{order.email}</a>{order.phone && ` · ${order.phone}`}</p>
          <p className="text-muted-foreground">
            Ship to: {[order.shipping_address?.line1, order.shipping_address?.line2, order.shipping_address?.city, order.shipping_address?.postcode, order.shipping_address?.country].filter(Boolean).join(', ')}
          </p>
        </div>
      </section>

      <section>
        <h2 className="font-heading text-xl mb-3">Items & Configuration</h2>
        <div className="border border-border divide-y divide-border">
          {(order.items || []).map((item, i) => (
            <div key={i} className="p-4 flex gap-4">
              <div className="w-16 h-16 bg-muted flex-shrink-0">
                {item.image && <Image src={item.image} alt={item.name} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 text-sm">
                <div className="flex justify-between gap-3">
                  <p className="font-medium">{item.name} × {item.quantity}</p>
                  <p>{formatPrice(item.line_total)}</p>
                </div>
                <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                  {item.sku && <p>SKU: {item.sku}</p>}
                  {Object.entries(item.options || {}).filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => (
                    <p key={k}>{k}: <span className="text-foreground">{v === true ? 'Yes' : v}</span></p>
                  ))}
                  {(item.customizations || []).map((c) => (
                    <p key={c.label}>{c.label}: <span className="text-foreground">{c.value}</span>{c.price > 0 && ` (+${formatPrice(c.price)})`}</p>
                  ))}
                </div>
                {item.special_request?.text && (
                  <div className="mt-3 border border-primary/40 bg-primary/5 p-3">
                    <p className="text-xs uppercase tracking-luxe text-primary mb-1">Special request ({item.special_request.payment_behaviour})</p>
                    <p className="text-sm whitespace-pre-line">{item.special_request.text}</p>
                    {(item.special_request.images || []).length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {item.special_request.images.map((u, x) => (
                          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="w-14 h-14 block">
                            <Image src={u} alt={`Reference ${x + 1}`} className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="border border-border p-5">
          <h2 className="font-heading text-xl mb-3">Payment Summary</h2>
          <div className="text-sm space-y-1.5">
            <p className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></p>
            {order.discount_amount > 0 && <p className="flex justify-between text-muted-foreground"><span>Discount ({order.discount_code})</span><span>−{formatPrice(order.discount_amount)}</span></p>}
            <p className="flex justify-between text-muted-foreground"><span>Shipping ({order.shipping_method})</span><span>{formatPrice(order.shipping_cost)}</span></p>
            <p className="flex justify-between font-medium hairline pt-2"><span>Total</span><span>{formatPrice(order.total)}</span></p>
            {order.deposit_required > 0 && <p className="flex justify-between text-primary"><span>Deposit required</span><span>{formatPrice(order.deposit_required)}</span></p>}
            <p className="flex justify-between"><span>Paid</span><span>{formatPrice(order.amount_paid)}</span></p>
            <p className="flex justify-between text-primary"><span>Balance due</span><span>{formatPrice(order.balance_due)}</span></p>
          </div>
          {order.payment_status === 'deposit_paid' && order.balance_due > 0 && (
            <div className="hairline mt-4 pt-4 space-y-2">
              <p className="text-[11px] uppercase tracking-luxe text-muted-foreground">Balance payment</p>
              <p className="text-xs text-muted-foreground">
                Emails the customer a secure link to pay the remaining {formatPrice(order.balance_due)} via Stripe.
              </p>
              <button onClick={requestBalance} disabled={!!busy || balanceSent}
                className="w-full flex items-center justify-center gap-2 bg-foreground text-background py-2.5 text-xs uppercase tracking-luxe hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-60">
                {busy === 'balance' && <Loader2 className="w-4 h-4 animate-spin" />} {balanceSent ? 'Request sent' : 'Request balance payment'}
              </button>
            </div>
          )}
        </div>

        <div className="border border-border p-5">
          <h2 className="font-heading text-xl mb-3">Payment Timeline</h2>
          {(order.payments || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <ol className="space-y-3 text-sm">
              {order.payments.map((p, i) => (
                <li key={i} className="flex justify-between gap-3 hairline pt-3 first:border-t-0 first:pt-0">
                  <div>
                    <p className="capitalize font-medium">{(p.type || '').replaceAll('_', ' ')} — {p.status}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.date).toLocaleString('en-GB')}{p.reference && ` · ${p.reference}`}</p>
                  </div>
                  <span>{formatPrice(p.amount)}</span>
                </li>
              ))}
            </ol>
          )}
          <h2 className="font-heading text-xl mt-6 mb-3">Internal Notes</h2>
          <div className="space-y-2 mb-3">
            {(order.internal_notes || []).map((n, i) => (
              <p key={i} className="text-sm border-l-2 border-primary/50 pl-3">
                {n.text} <span className="text-xs text-muted-foreground">— {new Date(n.date).toLocaleDateString('en-GB')}</span>
              </p>
            ))}
          </div>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" aria-label="Internal note" />
          <button onClick={addNote} className="mt-2 px-5 py-2 border border-border text-xs uppercase tracking-luxe hover:border-primary transition-colors">
            Add note
          </button>
        </div>
      </section>
    </div>
  );
}