import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function InventoryTab({ form, set }) {
  return (
    <div className="space-y-5 max-w-xl">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label>Availability</Label>
          <Select value={form.availability} onValueChange={(v) => set({ availability: v })}>
            <SelectTrigger className="mt-1.5" aria-label="Availability"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in_stock">In Stock</SelectItem>
              <SelectItem value="low_stock">Low Stock</SelectItem>
              <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              <SelectItem value="made_to_order">Made to Order</SelectItem>
              <SelectItem value="preorder">Available for Preorder</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="inv-qty">Stock quantity</Label>
          <Input id="inv-qty" type="number" min="0" value={form.stock_quantity ?? 0} className="mt-1.5"
            onChange={(e) => set({ stock_quantity: e.target.value })} />
        </div>
      </div>
      <div>
        <Label htmlFor="inv-lead">Production / lead time</Label>
        <Input id="inv-lead" value={form.lead_time || ''} placeholder="e.g. 3–4 weeks" className="mt-1.5"
          onChange={(e) => set({ lead_time: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="inv-care">Care information</Label>
        <Textarea id="inv-care" rows={4} value={form.care_info || ''} className="mt-1.5" onChange={(e) => set({ care_info: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="inv-ship">Shipping information</Label>
        <Textarea id="inv-ship" rows={4} value={form.shipping_info || ''} className="mt-1.5" onChange={(e) => set({ shipping_info: e.target.value })} />
      </div>
    </div>
  );
}