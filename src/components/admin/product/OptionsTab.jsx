import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TYPES = [
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'buttons', label: 'Buttons' },
  { value: 'swatches', label: 'Colour swatches' },
  { value: 'radio', label: 'Radio selection' },
  { value: 'text', label: 'Text input' },
  { value: 'number', label: 'Number input' },
  { value: 'checkbox', label: 'Checkbox' },
];
const SELECT_TYPES = ['dropdown', 'buttons', 'swatches', 'radio'];

export default function OptionsTab({ form, set }) {
  const options = form.options || [];
  const setOptions = (next) => set({ options: next });
  const updateOpt = (i, patch) => setOptions(options.map((o, x) => (x === i ? { ...o, ...patch } : o)));

  const combos = options
    .filter((o) => SELECT_TYPES.includes(o.type))
    .reduce((acc, o) => acc * Math.max(1, (o.values || []).length), 1);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Build configurable options — sizes, metals, stones, engraving fields. Price modifiers apply automatically, so you
        never need to create combinations by hand{combos > 1 && ` (currently covering ${combos} variant combinations)`}.
      </p>

      {options.map((opt, i) => (
        <div key={i} className="border border-border p-5 space-y-4">
          <div className="grid sm:grid-cols-[1fr_200px_auto_auto] gap-4 items-end">
            <div>
              <Label htmlFor={`opt-name-${i}`}>Option name</Label>
              <Input id={`opt-name-${i}`} value={opt.name} placeholder="e.g. Ring Size" className="mt-1.5"
                onChange={(e) => updateOpt(i, { name: e.target.value })} />
            </div>
            <div>
              <Label>Display as</Label>
              <Select value={opt.type} onValueChange={(v) => updateOpt(i, { type: v })}>
                <SelectTrigger className="mt-1.5" aria-label="Option type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm pb-2.5">
              <Switch checked={!!opt.required} onCheckedChange={(v) => updateOpt(i, { required: v })} /> Required
            </label>
            <button type="button" aria-label="Remove option" onClick={() => setOptions(options.filter((_, x) => x !== i))}
              className="p-2.5 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-luxe text-muted-foreground">
              {SELECT_TYPES.includes(opt.type) ? 'Values' : 'Price when filled in (optional)'}
            </p>
            {(SELECT_TYPES.includes(opt.type) ? opt.values || [] : (opt.values || []).slice(0, 1)).map((v, vi) => (
              <div key={vi} className="grid grid-cols-[1fr_120px_110px_auto] gap-2 items-center">
                {SELECT_TYPES.includes(opt.type) ? (
                  <Input value={v.label} placeholder="Value (e.g. 18ct Gold)" aria-label="Value label"
                    onChange={(e) => updateOpt(i, { values: opt.values.map((x, xi) => (xi === vi ? { ...x, label: e.target.value } : x)) })} />
                ) : (
                  <span className="text-sm text-muted-foreground">Extra charge</span>
                )}
                <Input type="number" step="0.01" value={v.price_modifier ?? 0} aria-label="Price modifier"
                  onChange={(e) => updateOpt(i, { values: (opt.values || [{}]).map((x, xi) => (xi === vi ? { ...x, price_modifier: Number(e.target.value) } : x)) })} />
                {opt.type === 'swatches' ? (
                  <input type="color" value={v.swatch || '#c5a059'} aria-label="Swatch colour" className="h-9 w-full cursor-pointer bg-transparent"
                    onChange={(e) => updateOpt(i, { values: opt.values.map((x, xi) => (xi === vi ? { ...x, swatch: e.target.value } : x)) })} />
                ) : (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch checked={v.available !== false} onCheckedChange={(c) => updateOpt(i, { values: (opt.values || [{}]).map((x, xi) => (xi === vi ? { ...x, available: c } : x)) })} />
                    Avail.
                  </label>
                )}
                {SELECT_TYPES.includes(opt.type) && (
                  <button type="button" aria-label="Remove value" onClick={() => updateOpt(i, { values: opt.values.filter((_, xi) => xi !== vi) })}
                    className="p-2 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {SELECT_TYPES.includes(opt.type) ? (
              <button type="button" onClick={() => updateOpt(i, { values: [...(opt.values || []), { label: '', price_modifier: 0, available: true }] })}
                className="text-xs uppercase tracking-luxe text-primary flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add value
              </button>
            ) : (
              !(opt.values || []).length && (
                <button type="button" onClick={() => updateOpt(i, { values: [{ label: '', price_modifier: 0 }] })}
                  className="text-xs uppercase tracking-luxe text-primary flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add extra charge
                </button>
              )
            )}
          </div>
        </div>
      ))}

      <button type="button"
        onClick={() => setOptions([...options, { name: '', type: 'dropdown', required: false, values: [] }])}
        className="flex items-center gap-2 border border-border px-5 py-2.5 text-xs uppercase tracking-luxe hover:border-primary transition-colors">
        <Plus className="w-4 h-4" /> Add Option
      </button>
    </div>
  );
}