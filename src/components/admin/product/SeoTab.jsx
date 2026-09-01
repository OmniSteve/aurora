import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function SeoTab({ form, set }) {
  const seo = form.seo || { title: '', description: '', og_image: '' };
  const setSeo = (patch) => set({ seo: { ...seo, ...patch } });

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <Label htmlFor="seo-title">SEO title</Label>
        <Input id="seo-title" value={seo.title || ''} placeholder={form.name ? `${form.name} | Aurora` : 'Page title'} className="mt-1.5"
          onChange={(e) => setSeo({ title: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="seo-desc">Meta description</Label>
        <Textarea id="seo-desc" rows={3} value={seo.description || ''} className="mt-1.5"
          onChange={(e) => setSeo({ description: e.target.value })} />
        <p className="text-xs text-muted-foreground mt-1">{(seo.description || '').length}/160 characters recommended</p>
      </div>
      <div>
        <Label htmlFor="seo-og">Social sharing image URL</Label>
        <Input id="seo-og" value={seo.og_image || ''} placeholder="Defaults to the featured product image" className="mt-1.5"
          onChange={(e) => setSeo({ og_image: e.target.value })} />
      </div>
      <p className="text-xs text-muted-foreground border border-border p-4 leading-relaxed">
        The product's clean URL is <span className="text-foreground">/product/{form.slug || 'your-slug'}</span> — editable
        in the Basics tab.
      </p>
    </div>
  );
}