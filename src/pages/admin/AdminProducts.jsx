import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, MoreHorizontal } from 'lucide-react';
import { api } from '@/api/aurora';
import { formatPrice, slugify } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Image } from '@/components/ui/image';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STATUS_COLORS = { published: 'default', draft: 'secondary', archived: 'outline' };

export default function AdminProducts() {
  const [products, setProducts] = useState(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const load = () => api.products.listAll().then(setProducts);
  useEffect(() => { load(); }, []);

  const duplicate = async (p) => {
    const { id, created_date, updated_date, created_by_id, ...rest } = p;
    const copy = await api.products.create({ ...rest, name: `${p.name} (Copy)`, slug: `${slugify(p.name)}-copy-${Date.now().toString(36)}`, status: 'draft' });
    navigate(`/admin/products/${copy.id}`);
  };

  const setStatus = async (p, status) => { await api.products.update(p.id, { status }); load(); };
  const remove = async (p) => {
    if (window.confirm(`Delete "${p.name}" permanently? This cannot be undone.`)) {
      await api.products.remove(p.id); load();
    }
  };

  const list = (products || []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-light">Products</h1>
        <Link to="/admin/products/new" className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> New Product
        </Link>
      </div>
      <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" aria-label="Search products" />

      {products === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-border p-6">No products found.</p>
      ) : (
        <div className="border border-border divide-y divide-border">
          {list.map((p) => {
            const img = p.images?.find((i) => i.featured) || p.images?.[0];
            return (
              <div key={p.id} className="flex items-center gap-4 p-3 hover:bg-accent/50 transition-colors">
                <Link to={`/admin/products/${p.id}`} className="w-12 h-12 bg-muted flex-shrink-0">
                  {img && <Image src={img.url} alt={p.name} className="w-full h-full object-cover" />}
                </Link>
                <Link to={`/admin/products/${p.id}`} className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.sku || 'No SKU'} · {formatPrice(p.price)}</p>
                </Link>
                <Badge variant={STATUS_COLORS[p.status] || 'secondary'} className="capitalize hidden sm:inline-flex">{p.status}</Badge>
                <Badge variant="outline" className="capitalize hidden md:inline-flex">{(p.availability || '').replaceAll('_', ' ')}</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger className="p-2" aria-label={`Actions for ${p.name}`}>
                    <MoreHorizontal className="w-4 h-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/admin/products/${p.id}`)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicate(p)}>Duplicate</DropdownMenuItem>
                    {p.status !== 'published' && <DropdownMenuItem onClick={() => setStatus(p, 'published')}>Publish</DropdownMenuItem>}
                    {p.status === 'published' && <DropdownMenuItem onClick={() => setStatus(p, 'draft')}>Unpublish</DropdownMenuItem>}
                    {p.status !== 'archived' && <DropdownMenuItem onClick={() => setStatus(p, 'archived')}>Archive</DropdownMenuItem>}
                    <DropdownMenuItem className="text-destructive" onClick={() => remove(p)}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}