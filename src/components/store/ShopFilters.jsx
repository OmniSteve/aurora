import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { formatPrice } from '@/lib/format';

export default function ShopFilters({ filters, setFilters, categories, collections, materials, maxPrice }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="shop-search" className="sr-only">Search jewellery</label>
        <Input
          id="shop-search"
          placeholder="Search jewellery…"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          className="pl-9"
        />
      </div>

      <FilterSelect label="Category" value={filters.category} onChange={(v) => set({ category: v })}
        options={categories.map((c) => ({ value: c.id, label: c.name }))} />
      <FilterSelect label="Collection" value={filters.collection} onChange={(v) => set({ collection: v })}
        options={collections.map((c) => ({ value: c.id, label: c.name }))} />
      <FilterSelect label="Material" value={filters.material} onChange={(v) => set({ material: v })}
        options={materials.map((m) => ({ value: m, label: m }))} />
      <FilterSelect label="Availability" value={filters.availability} onChange={(v) => set({ availability: v })}
        options={[
          { value: 'in_stock', label: 'In Stock' },
          { value: 'low_stock', label: 'Low Stock' },
          { value: 'made_to_order', label: 'Made to Order' },
          { value: 'preorder', label: 'Preorder' },
        ]} />

      <div>
        <p className="eyebrow !text-muted-foreground mb-3">
          Price — up to {formatPrice(filters.maxPrice)}
        </p>
        <Slider
          value={[filters.maxPrice]}
          min={0}
          max={maxPrice}
          step={10}
          onValueChange={([v]) => set({ maxPrice: v })}
          aria-label="Maximum price"
        />
      </div>

      <button
        onClick={() => setFilters({ search: '', category: 'all', collection: 'all', material: 'all', availability: 'all', maxPrice, sort: 'newest' })}
        className="text-xs uppercase tracking-luxe text-muted-foreground hover:text-primary transition-colors"
      >
        Clear filters
      </button>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <p className="eyebrow !text-muted-foreground mb-2">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={`All ${label.toLowerCase()}s`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}