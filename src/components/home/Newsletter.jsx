import React, { useState } from 'react';
import { api } from '@/api/aurora';
import { Input } from '@/components/ui/input';

export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');

  const submit = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    setStatus('sending');
    await api.newsletter.subscribe(email);
    setStatus('done');
    setEmail('');
  };

  return (
    <section className="max-w-2xl mx-auto px-6 py-[10vh] text-center">
      <h2 className="text-3xl font-light">Join the Aurora List</h2>
      <p className="text-muted-foreground mt-3">
        New collections, atelier stories and private previews — never more than once a month.
      </p>
      {status === 'done' ? (
        <p className="mt-8 text-primary" role="status">Thank you — you're on the list.</p>
      ) : (
        <form onSubmit={submit} className="mt-8 flex gap-3 max-w-md mx-auto">
          <label htmlFor="newsletter-email" className="sr-only">Email address</label>
          <Input
            id="newsletter-email"
            type="email"
            required
            placeholder="Your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="px-8 h-12 bg-primary text-primary-foreground text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {status === 'sending' ? '…' : 'Join'}
          </button>
        </form>
      )}
    </section>
  );
}