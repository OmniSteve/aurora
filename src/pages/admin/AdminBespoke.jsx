import React, { useEffect, useState } from 'react';
import { api } from '@/api/aurora';
import { formatPrice } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Image } from '@/components/ui/image';

const STATUSES = ['new', 'reviewing', 'more_info', 'quote_prepared', 'quote_sent', 'accepted', 'deposit_required', 'in_production', 'ready', 'completed', 'declined'];

export default function AdminBespoke() {
  const [requests, setRequests] = useState(null);
  const [active, setActive] = useState(null);
  const [quote, setQuote] = useState({});
  const [note, setNote] = useState('');

  const load = () => api.bespoke.listAll().then(setRequests);
  useEffect(() => { load(); }, []);

  const open = (r) => {
    setActive(r);
    setQuote(r.quote || { description: '', customisation: '', materials: '', stones: '', price: '', deposit_type: 'percentage', deposit_value: 30, estimated_completion: '', notes: '' });
    setNote('');
  };

  const update = async (patch) => {
    await api.bespoke.update(active.id, patch);
    const fresh = { ...active, ...patch };
    setActive(fresh);
    load();
  };

  const saveQuote = (send) =>
    update({
      quote: { ...quote, price: Number(quote.price) || 0, deposit_value: Number(quote.deposit_value) || 0 },
      status: send ? 'quote_sent' : 'quote_prepared',
    });

  const addNote = async () => {
    if (!note.trim()) return;
    await update({ internal_notes: [...(active.internal_notes || []), { text: note.trim(), date: new Date().toISOString() }] });
    setNote('');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-light">Bespoke Requests</h1>
      {requests === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-border p-6">No bespoke requests yet — customer commissions from the Bespoke page will appear here.</p>
      ) : (
        <div className="border border-border divide-y divide-border">
          {requests.map((r) => (
            <button key={r.id} onClick={() => open(r)} className="w-full flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-accent transition-colors text-left">
              <div>
                <p className="text-sm font-medium">{r.customer_name} — {r.jewellery_type || 'Jewellery'}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.created_date).toLocaleString('en-GB')} · {r.budget || 'No budget stated'}</p>
              </div>
              <Badge variant={r.status === 'new' ? 'default' : 'secondary'} className="capitalize">{(r.status || '').replaceAll('_', ' ')}</Badge>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl">{active.customer_name} — {active.jewellery_type || 'Bespoke request'}</DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                <div>
                  <Label>Status</Label>
                  <Select value={active.status} onValueChange={(v) => update({ status: v })}>
                    <SelectTrigger className="mt-1.5" aria-label="Request status"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replaceAll('_', ' ')}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="text-sm space-y-2 border border-border p-4">
                  <p><span className="text-muted-foreground">Contact:</span> <a href={`mailto:${active.email}`} className="text-primary">{active.email}</a>{active.phone && ` · ${active.phone}`}</p>
                  <p><span className="text-muted-foreground">Description:</span> {active.description}</p>
                  {active.inspiration && <p><span className="text-muted-foreground">Inspiration:</span> {active.inspiration}</p>}
                  {active.materials && <p><span className="text-muted-foreground">Materials:</span> {active.materials}</p>}
                  {active.stones && <p><span className="text-muted-foreground">Stones:</span> {active.stones}</p>}
                  {active.approximate_size && <p><span className="text-muted-foreground">Size:</span> {active.approximate_size}</p>}
                  {active.budget && <p><span className="text-muted-foreground">Budget:</span> {active.budget}</p>}
                  {active.completion_date && <p><span className="text-muted-foreground">Needed by:</span> {active.completion_date}</p>}
                  {active.notes && <p><span className="text-muted-foreground">Notes:</span> {active.notes}</p>}
                  {(active.reference_images || []).length > 0 && (
                    <div className="flex gap-2 pt-1">
                      {active.reference_images.map((u, i) => (
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="w-16 h-16 block">
                          <Image src={u} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border border-primary/40 p-4 space-y-3">
                  <h3 className="font-heading text-lg">Quote</h3>
                  <Textarea rows={2} placeholder="Quote description" value={quote.description || ''} onChange={(e) => setQuote({ ...quote, description: e.target.value })} aria-label="Quote description" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Agreed customisation" value={quote.customisation || ''} onChange={(e) => setQuote({ ...quote, customisation: e.target.value })} aria-label="Agreed customisation" />
                    <Input placeholder="Materials" value={quote.materials || ''} onChange={(e) => setQuote({ ...quote, materials: e.target.value })} aria-label="Quote materials" />
                    <Input placeholder="Stones" value={quote.stones || ''} onChange={(e) => setQuote({ ...quote, stones: e.target.value })} aria-label="Quote stones" />
                    <Input type="number" min="0" step="0.01" placeholder="Total price (£)" value={quote.price ?? ''} onChange={(e) => setQuote({ ...quote, price: e.target.value })} aria-label="Quote price" />
                    <Select value={quote.deposit_type || 'percentage'} onValueChange={(v) => setQuote({ ...quote, deposit_type: v })}>
                      <SelectTrigger aria-label="Deposit type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Deposit %</SelectItem>
                        <SelectItem value="fixed">Deposit £</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" min="0" placeholder="Deposit value" value={quote.deposit_value ?? ''} onChange={(e) => setQuote({ ...quote, deposit_value: e.target.value })} aria-label="Deposit value" />
                    <Input placeholder="Estimated completion (e.g. 6 weeks)" value={quote.estimated_completion || ''} onChange={(e) => setQuote({ ...quote, estimated_completion: e.target.value })} aria-label="Estimated completion" className="col-span-2" />
                  </div>
                  <Textarea rows={2} placeholder="Additional notes for the customer" value={quote.notes || ''} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} aria-label="Quote notes" />
                  {Number(quote.price) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Deposit due: {formatPrice(quote.deposit_type === 'fixed' ? Number(quote.deposit_value) || 0 : ((Number(quote.price) || 0) * (Number(quote.deposit_value) || 0)) / 100)}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => saveQuote(false)} className="px-5 py-2 border border-border text-xs uppercase tracking-luxe hover:border-primary transition-colors">Save quote</button>
                    <button onClick={() => saveQuote(true)} className="px-5 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors">Save & mark as sent</button>
                  </div>
                </div>

                <div>
                  <h3 className="font-heading text-lg mb-2">Internal notes</h3>
                  {(active.internal_notes || []).map((n, i) => (
                    <p key={i} className="text-sm border-l-2 border-primary/50 pl-3 mb-2">
                      {n.text} <span className="text-xs text-muted-foreground">— {new Date(n.date).toLocaleDateString('en-GB')}</span>
                    </p>
                  ))}
                  <div className="flex gap-2">
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" aria-label="Internal note" />
                    <button onClick={addNote} className="px-4 border border-border text-xs uppercase tracking-luxe hover:border-primary transition-colors">Add</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}