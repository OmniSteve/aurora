import React, { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '@/api/aurora';
import { baseUnitPrice } from '@/lib/pricing';
import ProductCard from '@/components/store/ProductCard';
import ShopFilters from '@/components/store/ShopFilters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

const MAX = 10000;

export default function Shop() {
  const urlParams = new URLSearchParams(window.location.search);
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [collections, setCollections] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    category: urlParams.get('category') || 'all',
    collection: urlParams.get('collection') || 'all',
    material: 'all',
    availability: 'all',
    maxPrice: MAX,
    sort: 'newest',
  });

  useEffect(() => {
    api.products.listPublished().then(setProducts);
    api.categories.listPublished().then(setCategories);
    api.collections.listPublished().then(setCollections);
  }, []);

  const materials = useMemo(
    () => [...new Set((products || []).flatMap((p) => p.materials || []))].sort(),
    [products]
  );

  const results = useMemo(() => {
    let list = products || [];
    const q = filters.search.trim().toLowerCase();
    if (q) list = list.filter((p) => `${p.name} ${p.short_description || ''} ${p.description || ''}`.toLowerCase().includes(q));
    if (filters.category !== 'all') list = list.filter((p) => p.category_id === filters.category);
    if (filters.collection !== 'all') list = list.filter((p) => (p.collection_ids || []).includes(filters.collection));
    if (filters.material !== 'all') list = list.filter((p) => (p.materials || []).includes(filters.material));
    if (filters.availability !== 'all') list = list.filter((p) => p.availability === filters.availability);
    list = list.filter((p) => baseUnitPrice(p) <= filters.maxPrice);
    const sorters = {
      newest: (a, b) => new Date(b.created_date) - new Date(a.created_date),
      price_asc: (a, b) => baseUnitPrice(a) - baseUnitPrice(b),
      price_desc: (a, b) => baseUnitPrice(b) - baseUnitPrice(a),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(sorters[filters.sort] || sorters.newest);
  }, [products, filters]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-14">
      <p className="text-xs uppercase tracking-luxe text-primary">The Collection</p>
      <h1 className="text-4xl md:text-5xl font-light mt-2 mb-10">Shop Jewellery</h1>

      <div className="flex items-center justify-between mb-8 gap-4">
        <Sheet>
          <SheetTrigger className="lg:hidden flex items-center gap-2 text-xs uppercase tracking-luxe border border-border px-4 py-2.5">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
          </SheetTrigger>
          <SheetContent side="left" className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <ShopFilters filters={filters} setFilters={setFilters} categories={categories} collections={collections} materials={materials} maxPrice={MAX} />
            </div>
          </SheetContent>
        </Sheet>
        <p className="text-sm text-muted-foreground hidden lg:block">
          {products === null ? 'Loading…' : `${results.length} piece${results.length === 1 ? '' : 's'}`}
        </p>
        <div className="w-48">
          <Select value={filters.sort} onValueChange={(v) => setFilters((f) => ({ ...f, sort: v }))}>
            <SelectTrigger aria-label="Sort products"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price_asc">Price: Low to High</SelectItem>
              <SelectItem value="price_desc">Price: High to Low</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-12">
        <aside className="hidden lg:block">
          <ShopFilters filters={filters} setFilters={setFilters} categories={categories} collections={collections} materials={materials} maxPrice={MAX} />
        </aside>
        <div>
          {products === null ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-square bg-muted animate-pulse" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-24">
              <p className="font-heading text-2xl">No pieces found</p>
              <p className="text-muted-foreground mt-2 text-sm">Try adjusting your filters or search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
              {results.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}