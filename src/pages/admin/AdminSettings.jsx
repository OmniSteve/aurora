import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '@/api/aurora';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const DEFAULTS = {
  store_name: 'Aurora', email: '', phone: '', address: '',
  currency: 'GBP', currency_symbol: '£', tax_rate: 20, prices_include_tax: true,
  instagram: '', facebook: '', tiktok: '',
  shipping_methods: [], stripe_enabled: false, stripe_test_mode: true,
};

export default function AdminSettings() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.settings.get().then((s) => setForm({ ...DEFAULTS, ...(s || {}) }));
  }, []);

  if (!form) return <p className="text-muted-foreground">Loading settings…</p>;

  const set = (patch) => { setSaved(false); setForm((f) => ({ ...f, ...patch })); };
  const setMethod = (i, patch) => set({ shipping_methods: form.shipping_methods.map((m, x) => (x === i ? { ...m, ...patch } : m)) });

  const save = async () => {
    setSaving(true);
    const { id, created_date, updated_date, created_by_id, ...data } = form;
    data.tax_rate = Number(data.tax_rate) || 0;
    data.shipping_methods = (data.shipping_methods || []).map((m) => ({
      ...m, price: Number(m.price) || 0, free_over: m.free_over === '' || m.free_over == null ? null : Number(m.free_over),
    }));
    await api.settings.save(data);
    setSaving(false);
    setSaved(true);
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-light">Settings</h1>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-60">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Settings
        </button>
      </div>
      {saved && <p className="text-sm text-primary" role="status">Settings saved.</p>}

      <Section title="Store Details">
        <Grid>
          <F label="Store name" value={form.store_name} onChange={(v) => set({ store_name: v })} />
          <F label="Contact email" value={form.email} onChange={(v) => set({ email: v })} />
          <F label="Phone" value={form.phone} onChange={(v) => set({ phone: v })} />
          <F label="Address" value={form.address} onChange={(v) => set({ address: v })} />
        </Grid>
      </Section>

      <Section title="Currency & Tax">
        <Grid>
          <F label="Currency code" value={form.currency} onChange={(v) => set({ currency: v })} />
          <F label="Currency symbol" value={form.currency_symbol} onChange={(v) => set({ currency_symbol: v })} />
          <F label="VAT / tax rate (%)" type="number" value={form.tax_rate} onChange={(v) => set({ tax_rate: v })} />
        </Grid>
        <label className="flex items-center justify-between text-sm mt-4">
          Prices include VAT
          <Switch checked={form.prices_include_tax} onCheckedChange={(v) => set({ prices_include_tax: v })} />
        </label>
      </Section>

      <Section title="Shipping Methods">
        <div className="space-y-3">
          {(form.shipping_methods || []).map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_1fr_90px_auto] gap-2 items-center">
              <Input value={m.name} placeholder="Method name" aria-label="Shipping method name" onChange={(e) => setMethod(i, { name: e.target.value })} />
              <Input type="number" min="0" step="0.01" value={m.price} placeholder="£" aria-label="Shipping price" onChange={(e) => setMethod(i, { price: e.target.value })} />
              <Input value={m.estimate || ''} placeholder="Delivery estimate" aria-label="Delivery estimate" onChange={(e) => setMethod(i, { estimate: e.target.value })} />
              <Input type="number" min="0" value={m.free_over ?? ''} placeholder="Free >£" aria-label="Free shipping threshold" onChange={(e) => setMethod(i, { free_over: e.target.value })} />
              <button aria-label="Remove shipping method" onClick={() => set({ shipping_methods: form.shipping_methods.filter((_, x) => x !== i) })}
                className="p-2 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button onClick={() => set({ shipping_methods: [...(form.shipping_methods || []), { name: '', price: 0, estimate: '', free_over: null }] })}
            className="flex items-center gap-2 text-xs uppercase tracking-luxe text-primary">
            <Plus className="w-3.5 h-3.5" /> Add shipping method
          </button>
        </div>
      </Section>

      <Section title="Social Media">
        <Grid>
          <F label="Instagram URL" value={form.instagram} onChange={(v) => set({ instagram: v })} />
          <F label="Facebook URL" value={form.facebook} onChange={(v) => set({ facebook: v })} />
          <F label="TikTok URL" value={form.tiktok} onChange={(v) => set({ tiktok: v })} />
        </Grid>
      </Section>

      <Section title="Payments — Stripe">
        <div className="border border-primary/40 bg-primary/5 p-4 flex gap-3 text-sm leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            <strong>Stripe is not yet connected.</strong> Card payments require server-side Stripe keys
            (secret key & webhook secret) which are stored as secure environment secrets — never in this database.
            Ask your developer (or the assistant) to connect Stripe to activate checkout payments, deposits, balance
            requests and refunds.
          </p>
        </div>
        <div className="space-y-3 mt-4">
          <label className="flex items-center justify-between text-sm">
            Stripe enabled
            <Switch checked={form.stripe_enabled} onCheckedChange={(v) => set({ stripe_enabled: v })} />
          </label>
          <label className="flex items-center justify-between text-sm">
            Test mode
            <Switch checked={form.stripe_test_mode} onCheckedChange={(v) => set({ stripe_test_mode: v })} />
          </label>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="border border-border p-6">
      <h2 className="font-heading text-xl mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

function F({ label, value, onChange, type = 'text' }) {
  const id = `s-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="mt-1.5" />
    </div>
  );
}