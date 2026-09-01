import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { slugify } from '@/lib/format';

export default function BasicsTab({ form, set, categories, collections }) {
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="p-name">Name</Label>
        <Input id="p-name" value={form.name} className="mt-1.5"
          onChange={(e) => set({ name: e.target.value, slug: form.slug || slugify(e.target.value) })}
          onBlur={() => !form.slug && set({ slug: slugify(form.name) })} />
      </div>
      <div>
        <Label htmlFor="p-slug">URL slug</Label>
        <Input id="p-slug" value={form.slug} className="mt-1.5" onChange={(e) => set({ slug: slugify(e.target.value) })} />
      </div>
      <div>
        <Label htmlFor="p-short">Short description</Label>
        <Textarea id="p-short" rows={2} value={form.short_description} className="mt-1.5" onChange={(e) => set({ short_description: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="p-desc">Full description</Label>
        <Textarea id="p-desc" rows={6} value={form.description} className="mt-1.5" onChange={(e) => set({ description: e.target.value })} />
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label>Category</Label>
          <Select value={form.category_id || undefined} onValueChange={(v) => set({ category_id: v })}>
            <SelectTrigger className="mt-1.5" aria-label="Category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
            <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger className="mt-1.5" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Collections</Label>
        <div className="mt-2 space-y-2">
          {collections.length === 0 && <p className="text-xs text-muted-foreground">No collections yet.</p>}
          {collections.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={(form.collection_ids || []).includes(c.id)}
                onCheckedChange={(checked) =>
                  set({
                    collection_ids: checked
                      ? [...(form.collection_ids || []), c.id]
                      : (form.collection_ids || []).filter((x) => x !== c.id),
                  })
                }
              />
              {c.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="p-materials">Materials (comma separated)</Label>
        <Input id="p-materials" className="mt-1.5" value={(form.materials || []).join(', ')}
          onChange={(e) => set({ materials: e.target.value.split(',').map((m) => m.trim()).filter(Boolean) })} />
      </div>
      <div className="flex gap-8 pt-2">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={form.featured} onCheckedChange={(v) => set({ featured: v })} /> Featured
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={form.new_arrival} onCheckedChange={(v) => set({ new_arrival: v })} /> New arrival
        </label>
      </div>
    </div>
  );
}