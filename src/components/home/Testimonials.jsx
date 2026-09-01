import React from 'react';
import { Star } from 'lucide-react';

const TESTIMONIALS = [
  {
    name: 'Eleanor W.',
    location: 'London',
    text: 'Aurora remade my grandmother\u2019s ring into something I will wear every day for the rest of my life. The engraving detail brought me to tears.',
  },
  {
    name: 'James & Priya',
    location: 'Edinburgh',
    text: 'The bespoke process was effortless \u2014 sketches, a quote, a deposit, and eight weeks later the most beautiful sapphire engagement ring.',
  },
  {
    name: 'Sofia M.',
    location: 'Valletta',
    text: 'I asked for a longer chain and a birthstone swap through their special request option. It arrived exactly as imagined, beautifully boxed.',
  },
];

export default function Testimonials() {
  return (
    <section className="bg-foreground text-background dark:bg-card dark:text-card-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-[10vh]">
        <p className="text-xs uppercase tracking-luxe text-primary text-center">Kind Words</p>
        <h2 className="text-3xl md:text-4xl font-light text-center mt-3 mb-14">From Our Customers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="text-center px-4">
              <div className="flex justify-center gap-1 mb-5" aria-label="5 out of 5 stars">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-primary text-primary" />
                ))}
              </div>
              <blockquote className="font-heading text-lg leading-relaxed italic">“{t.text}”</blockquote>
              <figcaption className="mt-5 text-xs uppercase tracking-luxe opacity-70">
                {t.name} — {t.location}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}