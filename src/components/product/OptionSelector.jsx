import React from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPrice } from '@/lib/format';

const mod = (v) => (Number(v?.price_modifier) ? ` (+${formatPrice(v.price_modifier)})` : '');

export default function OptionSelector({ option, value, onChange }) {
  const label = (
    <p className="text-xs uppercase tracking-luxe text-muted-foreground mb-2.5">
      {option.name}
      {option.required && <span className="text-primary ml-1" aria-hidden="true">*</span>}
    </p>
  );

  if (option.type === 'dropdown') {
    return (
      <div>
        {label}
        <Select value={value || ''} onValueChange={onChange}>
          <SelectTrigger aria-label={option.name}><SelectValue placeholder={`Select ${option.name.toLowerCase()}`} /></SelectTrigger>
          <SelectContent>
            {(option.values || []).map((v) => (
              <SelectItem key={v.label} value={v.label} disabled={v.available === false}>
                {v.label}{mod(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (option.type === 'buttons' || option.type === 'radio') {
    return (
      <div role="radiogroup" aria-label={option.name}>
        {label}
        <div className="flex flex-wrap gap-2">
          {(option.values || []).map((v) => (
            <button
              key={v.label}
              type="button"
              role="radio"
              aria-checked={value === v.label}
              disabled={v.available === false}
              onClick={() => onChange(v.label)}
              className={`px-4 py-2 text-sm border transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary ${
                value === v.label ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:border-foreground/50'
              }`}
            >
              {v.label}{mod(v)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (option.type === 'swatches') {
    return (
      <div role="radiogroup" aria-label={option.name}>
        {label}
        <div className="flex flex-wrap gap-3">
          {(option.values || []).map((v) => (
            <button
              key={v.label}
              type="button"
              role="radio"
              aria-checked={value === v.label}
              aria-label={`${v.label}${mod(v)}`}
              title={`${v.label}${mod(v)}`}
              disabled={v.available === false}
              onClick={() => onChange(v.label)}
              className={`w-9 h-9 rounded-full border-2 transition-all disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary ${
                value === v.label ? 'border-primary scale-110' : 'border-border'
              }`}
              style={{ background: v.swatch || '#ccc' }}
            />
          ))}
        </div>
        {value && <p className="text-xs text-muted-foreground mt-2">{value}</p>}
      </div>
    );
  }

  if (option.type === 'checkbox') {
    const extra = Number(option.values?.[0]?.price_modifier) || 0;
    return (
      <div className="flex items-center gap-3">
        <Checkbox id={`opt-${option.name}`} checked={value === true} onCheckedChange={(c) => onChange(c === true)} />
        <label htmlFor={`opt-${option.name}`} className="text-sm">
          {option.name}
          {extra > 0 && <span className="text-primary ml-1">(+{formatPrice(extra)})</span>}
        </label>
      </div>
    );
  }

  // text / number
  const extra = Number(option.values?.[0]?.price_modifier) || 0;
  return (
    <div>
      {label}
      <Input
        type={option.type === 'number' ? 'number' : 'text'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={option.name}
        aria-label={option.name}
      />
      {extra > 0 && <p className="text-xs text-primary mt-1.5">Adds {formatPrice(extra)} when filled in</p>}
    </div>
  );
}