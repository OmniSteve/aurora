import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/aurora';
import { formatPrice } from '@/lib/format';
import { Badge } from '@/components/ui/badge';

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [bespoke, setBespoke] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.orders.listAll(), api.products.listAll(), api.bespoke.listAll()]).then(([o, p, b]) => {
      setOrders(o); setProducts(p); setBespoke(b); setLoading(false);
    });
  }, []);

  const today = new Date().toDateString();
  const todaysOrders = orders.filter((o) => new Date(o.created_date).toDateString() === today);
  const revenue = orders.reduce((s, o) => s + (o.amount_paid || 0), 0);
  const pendingPayments = orders.filter((o) => o.payment_status === 'pending').length;
  const outstanding = orders.reduce((s, o) => s + (o.balance_due || 0), 0);
  const deposits = orders.reduce((s, o) => s + (o.payments || []).filter((p) => p.type === 'deposit').reduce((a, p) => a + p.amount, 0), 0);
  const lowStock = products.filter((p) => p.availability === 'low_stock' || (p.availability === 'in_stock' && (p.stock_quantity ?? 99) <= 2));
  const newBespoke = bespoke.filter((b) => ['new', 'reviewing'].includes(b.status)).length;
  const specialRequests = orders.filter((o) => (o.items || []).some((i) => i.special_request?.text) && o.requires_approval).length;

  if (loading) return <p className="text-muted-foreground">Loading dashboard…</p>;

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-light">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Today's Orders" value={todaysOrders.length} />
        <Stat label="Revenue Collected" value={formatPrice(revenue)} />
        <Stat label="Pending Payments" value={pendingPayments} />
        <Stat label="Outstanding Balances" value={formatPrice(outstanding)} />
        <Stat label="Deposits Received" value={formatPrice(deposits)} />
        <Stat label="New Bespoke Requests" value={newBespoke} link="/admin/bespoke" />
        <Stat label="Special Requests to Review" value={specialRequests} link="/admin/orders" />
        <Stat label="Low Stock Items" value={lowStock.length} link="/admin/products" />
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-2xl">Recent Orders</h2>
          <Link to="/admin/orders" className="text-xs uppercase tracking-luxe text-primary">View all</Link>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-border p-6">No orders yet — they'll appear here as soon as customers check out.</p>
        ) : (
          <div className="border border-border divide-y divide-border">
            {orders.slice(0, 6).map((o) => (
              <Link key={o.id} to={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-accent transition-colors">
                <div>
                  <p className="text-sm font-medium">{o.order_number} — {o.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_date).toLocaleString('en-GB')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="capitalize">{(o.payment_status || '').replaceAll('_', ' ')}</Badge>
                  <Badge variant="secondary" className="capitalize hidden sm:inline-flex">{(o.production_status || '').replaceAll('_', ' ')}</Badge>
                  <span className="text-sm">{formatPrice(o.total)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {lowStock.length > 0 && (
        <section>
          <h2 className="font-heading text-2xl mb-4">Needs Attention</h2>
          <div className="border border-border divide-y divide-border">
            {lowStock.slice(0, 5).map((p) => (
              <Link key={p.id} to={`/admin/products/${p.id}`} className="flex items-center justify-between p-4 hover:bg-accent transition-colors">
                <p className="text-sm">{p.name}</p>
                <Badge variant="destructive">Low stock ({p.stock_quantity ?? 0})</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, link }) {
  const inner = (
    <div className="border border-border p-5 h-full hover:border-primary/60 transition-colors">
      <p className="text-[11px] uppercase tracking-luxe text-muted-foreground">{label}</p>
      <p className="text-2xl font-heading mt-2">{value}</p>
    </div>
  );
  return link ? <Link to={link}>{inner}</Link> : inner;
}