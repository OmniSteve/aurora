import React, { useRef, useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/api/aurora';
import { Image } from '@/components/ui/image';

const BEHAVIOUR_NOTES = {
  immediate: 'You can purchase immediately — we will follow your instructions during production.',
  approval: 'Aurora will review your request before payment is taken.',
  quote: 'This request will be quoted individually before payment.',
};

export default function SpecialRequestDrawer({ config, request, onSave }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(request?.text || '');
  const [images, setImages] = useState(request?.images || []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const maxImages = config.max_images || 3;

  const upload = async (files) => {
    setUploading(true);
    const remaining = maxImages - images.length;
    const urls = [];
    for (const f of [...files].slice(0, remaining)) {
      urls.push(await api.media.upload(f, { private: true }));
    }
    setImages((prev) => [...prev, ...urls]);
    setUploading(false);
  };

  const save = () => {
    onSave(text.trim() ? { text: text.trim(), images } : null);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border border-primary/50 bg-primary/5 px-5 py-4 text-left hover:bg-primary/10 transition-colors"
      >
        <span className="flex items-center gap-2 font-heading text-lg">
          <Sparkles className="w-4 h-4 text-primary" />
          {config.message || 'Have something different in mind?'}
        </span>
        <span className="block text-xs text-muted-foreground mt-1">
          {request?.text ? 'Special request added — tap to edit' : 'Tell us about your special request'}
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-heading text-2xl">{config.message || 'Have something different in mind?'}</SheetTitle>
            <SheetDescription>{BEHAVIOUR_NOTES[config.payment_behaviour] || BEHAVIOUR_NOTES.immediate}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div>
              <label htmlFor="sr-text" className="text-xs uppercase tracking-luxe text-muted-foreground block mb-2">
                Your request
              </label>
              <Textarea
                id="sr-text"
                rows={6}
                placeholder="Describe what you'd like us to change or add — stones, sizing, styling, anything at all."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            {config.allow_images && (
              <div>
                <p className="text-xs uppercase tracking-luxe text-muted-foreground mb-2">
                  Reference images ({images.length}/{maxImages})
                </p>
                <div className="flex flex-wrap gap-3">
                  {images.map((url, i) => (
                    <div key={url} className="relative w-20 h-20">
                      <Image src={url} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        aria-label="Remove image"
                        onClick={() => setImages(images.filter((u) => u !== url))}
                        className="absolute -top-2 -right-2 bg-foreground text-background rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {images.length < maxImages && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="w-20 h-20 border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary transition-colors"
                      aria-label="Upload reference image"
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : '+'}
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files?.length && upload(e.target.files)}
                />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={save} className="flex-1 bg-primary text-primary-foreground py-3 text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors">
                Save request
              </button>
              {request?.text && (
                <button
                  onClick={() => { setText(''); setImages([]); onSave(null); setOpen(false); }}
                  className="px-5 border border-border text-xs uppercase tracking-luxe hover:border-destructive hover:text-destructive transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}