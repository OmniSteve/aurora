import React, { useRef, useState } from 'react';
import { Upload, Trash2, ArrowUp, ArrowDown, Loader2, Star } from 'lucide-react';
import { api } from '@/api/aurora';
import { Input } from '@/components/ui/input';
import { Image } from '@/components/ui/image';

export default function ImagesTab({ form, set }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const images = form.images || [];

  const upload = async (files) => {
    setUploading(true);
    const added = [];
    for (const f of files) {
      const url = await api.media.upload(f);
      added.push({ url, alt: form.name || '', featured: false });
    }
    const next = [...images, ...added];
    if (!next.some((i) => i.featured) && next[0]) next[0].featured = true;
    set({ images: next });
    setUploading(false);
  };

  const update = (i, patch) => set({ images: images.map((img, x) => (x === i ? { ...img, ...patch } : img)) });
  const setFeatured = (i) => set({ images: images.map((img, x) => ({ ...img, featured: x === i })) });
  const move = (i, dir) => {
    const next = [...images];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ images: next });
  };
  const remove = (i) => set({ images: images.filter((_, x) => x !== i) });

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) upload([...e.dataTransfer.files]); }}
        className={`border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
        ) : (
          <>
            <Upload className="w-6 h-6 mx-auto text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground mt-3">Drag & drop images here, or</p>
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 text-xs uppercase tracking-luxe text-primary">
              Browse files
            </button>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => e.target.files?.length && upload([...e.target.files])} />
      </div>

      {images.map((img, i) => (
        <div key={img.url + i} className="flex items-center gap-4 border border-border p-3">
          <div className="w-16 h-16 bg-muted flex-shrink-0">
            <Image src={img.url} alt={img.alt || 'Product image'} className="w-full h-full object-cover" />
          </div>
          <Input value={img.alt || ''} placeholder="Alt text (describe the image)" onChange={(e) => update(i, { alt: e.target.value })} className="flex-1" aria-label={`Alt text for image ${i + 1}`} />
          <button type="button" onClick={() => setFeatured(i)} aria-label="Set as featured image"
            className={`p-2 ${img.featured ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <Star className={`w-4 h-4 ${img.featured ? 'fill-primary' : ''}`} />
          </button>
          <button type="button" onClick={() => move(i, -1)} aria-label="Move image up" className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0}>
            <ArrowUp className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => move(i, 1)} aria-label="Move image down" className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === images.length - 1}>
            <ArrowDown className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => remove(i)} aria-label="Delete image" className="p-2 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}