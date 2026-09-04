import React from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '@/components/store/ProductCard';
import Container from '@/components/store/editorial/Container';
import SectionHeading from '@/components/store/editorial/SectionHeading';
import Reveal from '@/components/store/editorial/Reveal';

// "Featured Pieces" -- large editorial product cards, imagery-first. Reused
// for any curated product row (currently just the homepage's featured
// selection, per the brief's homepage structure).
export default function ProductRow({ eyebrow, title, products }) {
  if (!products?.length) return null;
  return (
    <section className="section-y">
      <Container>
        <Reveal>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-14">
            <SectionHeading eyebrow={eyebrow} title={title} align="left" className="mb-0" />
            <Link to="/shop" className="text-[11px] uppercase tracking-luxe text-muted-foreground hover:text-primary transition-colors">
              View all
            </Link>
          </div>
        </Reveal>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12 md:gap-x-10">
          {products.slice(0, 4).map((p, i) => (
            <Reveal key={p.id} delay={Math.min(i, 3) * 0.08}>
              <ProductCard product={p} />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
