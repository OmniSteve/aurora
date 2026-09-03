import React, { useEffect, useState } from 'react';
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
      <MaterialsField productId={form.id} materials={form.materials} onChange={(materials) => set({ materials })} />
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

// The input's displayed text is its own local state, not derived from
// materials.join(', ') on every render -- that round-trip (split -> trim ->
// filter -> join, immediately fed back into a controlled input's value on
// every keystroke) is what previously mangled multi-word/comma-separated
// entries: reformatting the value out from under a mid-typing cursor
// resets its position, so later keystrokes land in the wrong place and
// text gets dropped/scrambled ("Blue Aquamarine, Rose Quartz" -> something
// like "AquamarineRoseQuarts"). Typing itself never mutates the text; only
// the derived `materials` array sent up via onChange is parsed, and even
// that only trims/drops-empty per item -- final dedup happens server-side
// (productsRepository.js's normalizeMaterials()) so this stays simple.
function MaterialsField({ productId, materials, onChange }) {
  const [text, setText] = useState((materials || []).join(', '));

  // Only resync from the loaded product's data when the product identity
  // itself changes (switching which product is being edited) -- never in
  // response to our own onChange below, or every keystroke would still
  // fight the cursor exactly as before.
  useEffect(() => {
    setText((materials || []).join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const handleChange = (e) => {
    const raw = e.target.value;
    setText(raw);
    onChange(raw.split(',').map((m) => m.trim()).filter(Boolean));
  };

  return (
    <div>
      <Label htmlFor="p-materials">Materials (comma separated)</Label>
      <Input id="p-materials" className="mt-1.5" placeholder="e.g. Sterling Silver, 18ct Gold" value={text} onChange={handleChange} />
    </div>
  );
}