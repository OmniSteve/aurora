import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { slugify } from '@/lib/format';

const EMPTY_FORM = { name: '', slug: '' };

// Shared Category/Collection CRUD UI -- both are the same shape (name, slug,
// product count, create/edit/delete through an authoritative admin API that
// already refuses deletion while products still reference the row), so one
// parameterised component covers both rather than two near-duplicates.
// `api` is { listAll, create, update, remove } -- the existing
// api.categories.* / api.collections.* wrappers, unchanged.
export default function TaxonomyManager({ title, itemLabel, api }) {
  const { toast } = useToast();
  const [items, setItems] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => api.listAll().then(setItems);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setFormError(''); setDialogOpen(true); };
  const openEdit = (item) => { setEditingId(item.id); setForm({ name: item.name, slug: item.slug || '' }); setFormError(''); setDialogOpen(true); };

  const save = async () => {
    if (!form.name.trim()) return setFormError('Name is required.');
    if (!form.slug.trim()) return setFormError('Slug is required.');
    setSaving(true);
    setFormError('');
    try {
      const payload = { name: form.name.trim(), slug: form.slug.trim() };
      if (editingId) await api.update(editingId, payload);
      else await api.create(payload);
      setDialogOpen(false);
      load();
      toast({ title: editingId ? `${title.slice(0, -1)} updated` : `${title.slice(0, -1)} created`, description: payload.name });
    } catch (e) {
      // Surfaces the server's own message -- e.g. "This slug is already in
      // use by another category" -- rather than a generic failure.
      setFormError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // A product_count > 0 item is never deletable (the server refuses it too
  // -- this is a same-turnaround-time UX shortcut, not the actual guard),
  // so there's no point opening a confirm dialog just to fail; explain why
  // instead.
  const requestDelete = (item) => {
    if (item.product_count > 0) {
      const n = item.product_count;
      toast({
        title: `Can't delete this ${itemLabel}`,
        description: `This ${itemLabel} is currently used by ${n} product${n === 1 ? '' : 's'}. Reassign ${n === 1 ? 'it' : 'them'} before deleting it.`,
        variant: 'destructive',
      });
      return;
    }
    setDeleteTarget(item);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.remove(deleteTarget.id);
      const name = deleteTarget.name;
      setDeleteTarget(null);
      load();
      toast({ title: `${title.slice(0, -1)} deleted`, description: name });
    } catch (e) {
      // Defense in depth: the server re-checks product_count itself even
      // though the button above already precludes reaching here for an
      // in-use item -- covers the case where it became in-use between the
      // list load and this click.
      toast({ title: `Couldn't delete this ${itemLabel}`, description: e.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  if (!items) return <p className="text-muted-foreground text-sm">Loading {title.toLowerCase()}…</p>;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? itemLabel : `${itemLabel}s`}</p>
        <button onClick={openCreate} className="flex items-center gap-2 text-xs uppercase tracking-luxe text-primary">
          <Plus className="w-3.5 h-3.5" /> Add {itemLabel}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed border-border p-6 text-center">
          No {title.toLowerCase()} yet. Add your first one to organise the catalogue.
        </p>
      ) : (
        <div className="border border-border divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  /{item.slug} · {item.product_count} product{item.product_count === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)} className="p-2 text-muted-foreground hover:text-primary transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button aria-label={`Delete ${item.name}`} onClick={() => requestDelete(item)} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? `Edit ${itemLabel}` : `Add ${itemLabel}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tax-name">Name</Label>
              <Input
                id="tax-name"
                value={form.name}
                className="mt-1.5"
                onChange={(e) => setForm((f) => ({ name: e.target.value, slug: f.slug || slugify(e.target.value) }))}
                onBlur={() => !form.slug && setForm((f) => ({ ...f, slug: slugify(f.name) }))}
              />
            </div>
            <div>
              <Label htmlFor="tax-slug">Slug</Label>
              <Input id="tax-slug" value={form.slug} className="mt-1.5" onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))} />
            </div>
            {formError && <p className="text-destructive text-sm" role="alert">{formError}</p>}
          </div>
          <DialogFooter>
            <button onClick={() => setDialogOpen(false)} disabled={saving} className="px-5 py-2 border border-border text-xs uppercase tracking-luxe hover:border-foreground transition-colors">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center justify-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!deleting && !open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-2"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
