import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function PricingTab({ form, set }) {
  const deposit = form.deposit || { enabled: false, type: 'percentage', value: 30 };
  const setDeposit = (patch) => set({ deposit: { ...deposit, ...patch } });

  return (
    <div className="space-y-5 max-w-lg">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="p-price">Price (£)</Label>
          <Input id="p-price" type="number" min="0" step="0.01" value={form.price} className="mt-1.5" onChange={(e) => set({ price: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="p-sale">Sale price (£, optional)</Label>
          <Input id="p-sale" type="number" min="0" step="0.01" value={form.sale_price ?? ''} className="mt-1.5"
            onChange={(e) => set({ sale_price: e.target.value === '' ? null : e.target.value })} />
        </div>
      </div>
      <div>
        <Label htmlFor="p-sku">SKU</Label>
        <Input id="p-sku" value={form.sku} className="mt-1.5" onChange={(e) => set({ sku: e.target.value })} />
      </div>

      <div className="border border-border p-5 space-y-4">
        <label className="flex items-center justify-between text-sm font-medium">
          Require a deposit
          <Switch checked={deposit.enabled} onCheckedChange={(v) => setDeposit({ enabled: v })} />
        </label>
        {deposit.enabled && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Deposit type</Label>
              <Select value={deposit.type} onValueChange={(v) => setDeposit({ type: v })}>
                <SelectTrigger className="mt-1.5" aria-label="Deposit type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed amount (£)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="p-dep-val">{deposit.type === 'fixed' ? 'Amount (£)' : 'Percentage (%)'}</Label>
              <Input id="p-dep-val" type="number" min="0" value={deposit.value} className="mt-1.5"
                onChange={(e) => setDeposit({ value: Number(e.target.value) })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}