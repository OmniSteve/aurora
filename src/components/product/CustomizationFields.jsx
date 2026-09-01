import React from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPrice } from '@/lib/format';

export default function CustomizationFields({ customizations = [], values, onChange }) {
  if (!customizations.length) return null;
  const set = (label, v) => onChange({ ...values, [label]: v });

  return (
    <div className="space-y-5">
      <h2 className="font-heading text-xl">Personalise Your Piece</h2>
      {customizations.map((c) => {
        const priceTag = Number(c.price) > 0 && (
          <span className="text-primary ml-1.5 text-xs">+{formatPrice(c.price)}</span>
        );
        const id = `custom-${c.label}`;

        if (c.type === 'checkbox') {
          return (
            <div key={c.label} className="flex items-center gap-3">
              <Checkbox id={id} checked={values[c.label] === true} onCheckedChange={(v) => set(c.label, v === true)} />
              <label htmlFor={id} className="text-sm">{c.label}{priceTag}</label>
            </div>
          );
        }
        if (c.type === 'select') {
          return (
            <div key={c.label}>
              <label htmlFor={id} className="text-xs uppercase tracking-luxe text-muted-foreground block mb-2">
                {c.label}{priceTag}
              </label>
              <Select value={values[c.label] || ''} onValueChange={(v) => set(c.label, v)}>
                <SelectTrigger id={id}><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {(c.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          );
        }
        return (
          <div key={c.label}>
            <label htmlFor={id} className="text-xs uppercase tracking-luxe text-muted-foreground block mb-2">
              {c.label}{priceTag}
            </label>
            <Input
              id={id}
              type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
              maxLength={c.max_length || undefined}
              placeholder={c.placeholder || ''}
              value={values[c.label] || ''}
              onChange={(e) => set(c.label, e.target.value)}
            />
            {c.max_length && c.type === 'text' && (
              <p className="text-xs text-muted-foreground mt-1">{(values[c.label] || '').length}/{c.max_length} characters</p>
            )}
          </div>
        );
      })}
    </div>
  );
}