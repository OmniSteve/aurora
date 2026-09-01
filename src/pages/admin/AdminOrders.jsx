import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/aurora';
import { formatPrice } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AdminOrders() {
  const [orders, setOrders] = useState(null);
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('all');
  const [prodFilter, setProdFilter] = useState('all');

  useEffect(() => { api.orders.listAll().then(setOrders); }, []);

  const list = (orders || []).filter((o) => {
    const q = search.toLowerCase();
    if (q && !`${o.order_number} ${o.customer_name} ${o.email}`.toLowerCase().includes(q)) return false;
    if (payFilter !== 'all' && o.payment_status !== payFilter) return false;
    if (prodFilter !== 'all' && o.production_status !== prodFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-light">Orders</h1>
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search by number, name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" aria-label="Search orders" />
        <Select value={payFilter} onValueChange={setPayFilter}>
          <SelectTrigger className="w-44" aria-label="Filter by payment status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment states</SelectItem>
            {['pending', 'processing', 'deposit_paid', 'paid', 'failed', 'cancelled', 'partially_refunded', 'refunded'].map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s.replaceAll('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={prodFilter} onValueChange={setProdFilter}>
          <SelectTrigger className="w-48" aria-label="Filter by production status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All production states</SelectItem>
            {['awaiting_payment', 'awaiting_approval', 'confirmed', 'in_production', 'quality_check', 'ready_to_dispatch', 'dispatched', 'delivered', 'cancelled'].map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s.replaceAll('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orders === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-border p-6">No orders match.</p>
      ) : (
        <div className="border border-border divide-y divide-border">
          {list.map((o) => (
            <Link key={o.id} to={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-accent transition-colors">
              <div>
                <p className="text-sm font-medium">{o.order_number} — {o.customer_name}</p>
                <p className="text-xs text-muted-foreground">{new Date(o.created_date).toLocaleString('en-GB')} · {o.email}</p>
              </div>
              <div className="flex items-center gap-3">
                {o.requires_approval && <Badge className="bg-primary text-primary-foreground">Needs review</Badge>}
                <Badge variant="outline" className="capitalize">{(o.payment_status || '').replaceAll('_', ' ')}</Badge>
                <Badge variant="secondary" className="capitalize">{(o.production_status || '').replaceAll('_', ' ')}</Badge>
                <span className="text-sm w-20 text-right">{formatPrice(o.total)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}