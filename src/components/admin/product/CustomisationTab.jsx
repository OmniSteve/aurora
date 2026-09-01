import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Choice list' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
];

export default function CustomisationTab({ form, set }) {
  const items = form.customizations || [];
  const setItems = (next) => set({ customizations: next });
  const update = (i, patch) => setItems(items.map((c, x) => (x === i ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Personalisation fields shown on the product page — engraving, initials, dates, birthstones. Each field can add an
        optional charge, which is clearly displayed to the customer before adding to cart.
      </p>

      {items.map((c, i) => (
        <div key={i} className="border border-border p-5 grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor={`c-label-${i}`}>Field label</Label>
            <Input id={`c-label-${i}`} value={c.label} placeholder="e.g. Personal engraving" className="mt-1.5"
              onChange={(e) => update(i, { label: e.target.value })} />
          </div>
          <div>
            <Label>Field type</Label>
            <Select value={c.type} onValueChange={(v) => update(i, { type: v })}>
              <SelectTrigger className="mt-1.5" aria-label="Field type"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`c-price-${i}`}>Additional charge (£, 0 for free)</Label>
            <Input id={`c-price-${i}`} type="number" min="0" step="0.01" value={c.price ?? 0} className="mt-1.5"
              onChange={(e) => update(i, { price: Number(e.target.value) })} />
          </div>
          {c.type === 'select' ? (
            <div>
              <Label htmlFor={`c-opts-${i}`}>Choices (comma separated)</Label>
              <Input id={`c-opts-${i}`} value={(c.options || []).join(', ')} className="mt-1.5"
                onChange={(e) => update(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />
            </div>
          ) : c.type === 'text' ? (
            <div>
              <Label htmlFor={`c-max-${i}`}>Max characters (optional)</Label>
              <Input id={`c-max-${i}`} type="number" min="0" value={c.max_length ?? ''} className="mt-1.5"
                onChange={(e) => update(i, { max_length: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </div>
          ) : <div />}
          <div className="sm:col-span-2 flex justify-between items-end gap-4">
            <div className="flex-1">
              <Label htmlFor={`c-ph-${i}`}>Placeholder (optional)</Label>
              <Input id={`c-ph-${i}`} value={c.placeholder || ''} className="mt-1.5" onChange={(e) => update(i, { placeholder: e.target.value })} />
            </div>
            <button type="button" aria-label="Remove field" onClick={() => setItems(items.filter((_, x) => x !== i))}
              className="p-2.5 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      <button type="button"
        onClick={() => setItems([...items, { label: '', type: 'text', price: 0, options: [], placeholder: '' }])}
        className="flex items-center gap-2 border border-border px-5 py-2.5 text-xs uppercase tracking-luxe hover:border-primary transition-colors">
        <Plus className="w-4 h-4" /> Add Personalisation Field
      </button>
    </div>
  );
}