import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { api } from '@/api/aurora';

const DATASETS = [
  { key: 'products', label: 'Products', load: () => api.products.listAll() },
  { key: 'categories', label: 'Categories', load: () => api.categories.listAll() },
  { key: 'collections', label: 'Collections', load: () => api.collections.listAll() },
  { key: 'orders', label: 'Orders', load: () => api.orders.listAll() },
  { key: 'bespoke_requests', label: 'Bespoke requests', load: () => api.bespoke.listAll() },
  { key: 'discounts', label: 'Discount codes', load: () => api.discounts.listAll() },
  { key: 'settings', label: 'Store settings', load: async () => [await api.settings.get()].filter(Boolean) },
  { key: 'newsletter_subscribers', label: 'Newsletter subscribers', load: () => api.newsletter.listAll() },
  { key: 'users', label: 'Users (profile fields only)', load: () => api.users.listAll() },
];

function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminExport() {
  const [busy, setBusy] = useState('');

  const run = async (ds) => {
    setBusy(ds.key);
    download(ds.key, await ds.load());
    setBusy('');
  };

  const runAll = async () => {
    for (const ds of DATASETS) await run(ds);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-light">Data Export</h1>
        <button onClick={runAll} disabled={!!busy}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-60">
          <Download className="w-4 h-4" /> Download all
        </button>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Downloads each dataset as portable JSON for migration. No passwords, tokens or credentials are included.
        See <code>migration/EXPORT.md</code> in the repository for the file layout.
      </p>
      <div className="border border-border divide-y divide-border">
        {DATASETS.map((ds) => (
          <div key={ds.key} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">{ds.label}</p>
              <p className="text-xs text-muted-foreground">{ds.key}.json</p>
            </div>
            <button onClick={() => run(ds)} disabled={!!busy} aria-label={`Download ${ds.label}`}
              className="flex items-center gap-2 px-4 py-2 border border-border text-xs uppercase tracking-luxe hover:border-primary transition-colors disabled:opacity-60">
              {busy === ds.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}