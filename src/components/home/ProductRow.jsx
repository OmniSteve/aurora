import React from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '@/components/store/ProductCard';

export default function ProductRow({ eyebrow, title, products }) {
  if (!products?.length) return null;
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8 py-[8vh]">
      <div className="flex items-end justify-between mb-12">
        <div>
          <p className="text-xs uppercase tracking-luxe text-primary">{eyebrow}</p>
          <h2 className="text-3xl md:text-4xl font-light mt-2">{title}</h2>
        </div>
        <Link to="/shop" className="text-xs uppercase tracking-luxe text-muted-foreground hover:text-primary transition-colors hidden sm:block">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
        {products.slice(0, 4).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}