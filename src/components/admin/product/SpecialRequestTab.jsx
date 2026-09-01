import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const BEHAVIOURS = [
  { value: 'immediate', label: 'Customer can purchase immediately', hint: 'The request is attached to the order and paid for as normal.' },
  { value: 'approval', label: 'Requires Aurora approval before payment', hint: 'No payment is taken until you review and approve the request.' },
  { value: 'quote', label: 'Requires a custom quote', hint: 'You prepare an individual quote before any payment.' },
];

export default function SpecialRequestTab({ form, set }) {
  const sr = form.special_request || { enabled: false, message: '', allow_images: true, max_images: 3, payment_behaviour: 'approval' };
  const setSr = (patch) => set({ special_request: { ...sr, ...patch } });

  return (
    <div className="space-y-6 max-w-xl">
      <label className="flex items-center justify-between border border-border p-5 text-sm font-medium">
        Allow special requests on this product
        <Switch checked={!!sr.enabled} onCheckedChange={(v) => setSr({ enabled: v })} />
      </label>

      {sr.enabled && (
        <>
          <div>
            <Label htmlFor="sr-msg">Customer-facing message</Label>
            <Input id="sr-msg" value={sr.message || ''} placeholder="Have something different in mind?" className="mt-1.5"
              onChange={(e) => setSr({ message: e.target.value })} />
          </div>
          <div className="flex items-center justify-between border border-border p-4 text-sm">
            Allow reference images
            <Switch checked={sr.allow_images !== false} onCheckedChange={(v) => setSr({ allow_images: v })} />
          </div>
          {sr.allow_images !== false && (
            <div>
              <Label htmlFor="sr-max">Maximum uploaded images</Label>
              <Input id="sr-max" type="number" min="1" max="10" value={sr.max_images ?? 3} className="mt-1.5 w-32"
                onChange={(e) => setSr({ max_images: Number(e.target.value) })} />
            </div>
          )}
          <div>
            <Label>Payment behaviour</Label>
            <RadioGroup value={sr.payment_behaviour || 'approval'} onValueChange={(v) => setSr({ payment_behaviour: v })} className="mt-3 space-y-3">
              {BEHAVIOURS.map((b) => (
                <label key={b.value} className={`flex gap-3 border p-4 cursor-pointer ${sr.payment_behaviour === b.value ? 'border-primary' : 'border-border'}`}>
                  <RadioGroupItem value={b.value} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{b.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{b.hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>
        </>
      )}
    </div>
  );
}