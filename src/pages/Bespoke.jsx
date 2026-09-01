import React, { useRef, useState } from 'react';
import { Loader2, X, CheckCircle2 } from 'lucide-react';
import { api } from '@/api/aurora';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image } from '@/components/ui/image';

const TYPES = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Pendant', 'Anklet', 'Other'];
const STEPS = ['About You', 'Your Vision', 'References'];

export default function Bespoke() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    customer_name: '', email: '', phone: '',
    jewellery_type: '', description: '', inspiration: '', materials: '', stones: '',
    approximate_size: '', budget: '', completion_date: '',
    reference_images: [], notes: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const upload = async (files) => {
    setUploading(true);
    const urls = [];
    for (const f of [...files].slice(0, 5 - form.reference_images.length)) {
      urls.push(await api.media.upload(f));
    }
    set('reference_images', [...form.reference_images, ...urls]);
    setUploading(false);
  };

  const next = () => {
    setError('');
    if (step === 0 && (!form.customer_name.trim() || !form.email.includes('@'))) {
      return setError('Please enter your name and a valid email address.');
    }
    if (step === 1 && (!form.jewellery_type || !form.description.trim())) {
      return setError('Please choose a jewellery type and describe your idea.');
    }
    setStep(step + 1);
  };

  const submit = async () => {
    setSubmitting(true);
    await api.bespoke.create({ ...form, status: 'new' });
    setDone(true);
  };

  if (done) {
    return (
      <div className="max-w-xl mx-auto px-6 py-32 text-center">
        <CheckCircle2 className="w-12 h-12 text-primary mx-auto" aria-hidden="true" />
        <h1 className="text-4xl font-light mt-6">Request received</h1>
        <p className="text-muted-foreground mt-4 leading-relaxed">
          Thank you, {form.customer_name.split(' ')[0]}. Our designers will review your vision and reply to{' '}
          {form.email} within two working days with next steps and, where possible, an initial quote.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-14">
      <p className="text-xs uppercase tracking-luxe text-primary">The Atelier</p>
      <h1 className="text-4xl md:text-5xl font-light mt-2">Bespoke Commission</h1>
      <p className="text-muted-foreground mt-4 leading-relaxed">
        For something that doesn't exist yet. Tell us about the piece you're imagining and our designers will bring it to life.
      </p>

      <ol className="flex gap-2 mt-10 mb-10 text-xs uppercase tracking-luxe" aria-label="Form progress">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex-1 border-t-2 pt-3 ${i <= step ? 'border-primary' : 'border-border text-muted-foreground'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-5">
          <F label="Full name *" id="b-name" value={form.customer_name} onChange={(v) => set('customer_name', v)} />
          <F label="Email *" id="b-email" type="email" value={form.email} onChange={(v) => set('email', v)} />
          <F label="Phone (optional)" id="b-phone" value={form.phone} onChange={(v) => set('phone', v)} />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <Label className="text-xs uppercase tracking-luxe text-muted-foreground">Jewellery type *</Label>
            <Select value={form.jewellery_type} onValueChange={(v) => set('jewellery_type', v)}>
              <SelectTrigger className="mt-1.5" aria-label="Jewellery type"><SelectValue placeholder="Choose a type" /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="b-desc" className="text-xs uppercase tracking-luxe text-muted-foreground">Describe your idea *</Label>
            <Textarea id="b-desc" rows={5} className="mt-1.5" value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="The piece, the occasion, the person it's for…" />
          </div>
          <div>
            <Label htmlFor="b-insp" className="text-xs uppercase tracking-luxe text-muted-foreground">Inspiration</Label>
            <Textarea id="b-insp" rows={3} className="mt-1.5" value={form.inspiration} onChange={(e) => set('inspiration', e.target.value)}
              placeholder="Styles, eras, places or pieces you love." />
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <F label="Preferred materials" id="b-mat" value={form.materials} onChange={(v) => set('materials', v)} placeholder="e.g. 18ct yellow gold" />
            <F label="Stones" id="b-stones" value={form.stones} onChange={(v) => set('stones', v)} placeholder="e.g. Emerald, diamonds" />
            <F label="Approximate size" id="b-size" value={form.approximate_size} onChange={(v) => set('approximate_size', v)} placeholder="e.g. Ring size M" />
            <F label="Budget" id="b-budget" value={form.budget} onChange={(v) => set('budget', v)} placeholder="e.g. £1,500 – £2,500" />
            <F label="Desired completion date" id="b-date" type="date" value={form.completion_date} onChange={(v) => set('completion_date', v)} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-luxe text-muted-foreground mb-3">
              Reference images ({form.reference_images.length}/5)
            </p>
            <div className="flex flex-wrap gap-3">
              {form.reference_images.map((url, i) => (
                <div key={url} className="relative w-24 h-24">
                  <Image src={url} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" />
                  <button type="button" aria-label="Remove image"
                    onClick={() => set('reference_images', form.reference_images.filter((u) => u !== url))}
                    className="absolute -top-2 -right-2 bg-foreground text-background rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {form.reference_images.length < 5 && (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="w-24 h-24 border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary transition-colors"
                  aria-label="Upload reference image">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : '+'}
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => e.target.files?.length && upload(e.target.files)} />
          </div>
          <div>
            <Label htmlFor="b-notes" className="text-xs uppercase tracking-luxe text-muted-foreground">Additional notes</Label>
            <Textarea id="b-notes" rows={4} className="mt-1.5" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
      )}

      {error && <p className="text-destructive text-sm mt-6" role="alert">{error}</p>}
      <div className="flex gap-4 mt-10">
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="px-8 py-3 border border-border text-xs uppercase tracking-luxe hover:border-foreground transition-colors">
            Back
          </button>
        )}
        {step < 2 ? (
          <button onClick={next} className="px-10 py-3 bg-foreground text-background text-xs uppercase tracking-luxe hover:bg-primary hover:text-primary-foreground transition-colors">
            Continue
          </button>
        ) : (
          <button onClick={submit} disabled={submitting}
            className="px-10 py-3 bg-primary text-primary-foreground text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit Request
          </button>
        )}
      </div>
    </div>
  );
}

function F({ label, id, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs uppercase tracking-luxe text-muted-foreground">{label}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1.5" />
    </div>
  );
}