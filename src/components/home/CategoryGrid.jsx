import React from 'react';
import { Link } from 'react-router-dom';
import Image from '@/components/ui/image';

export default function CategoryGrid({ categories }) {
  if (!categories?.length) return null;
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8 py-[8vh]">
      <p className="text-xs uppercase tracking-luxe text-primary text-center">Browse</p>
      <h2 className="text-3xl md:text-4xl font-light text-center mt-3 mb-12">Shop by Category</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {categories.map((c) => (
          <Link key={c.id} to={`/shop?category=${c.id}`} className="group relative aspect-square overflow-hidden block">
            {c.image && (
              <Image
                src={c.image}
                alt={c.name}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            )}
            <div className="absolute inset-0 bg-black/35 group-hover:bg-black/20 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center text-white text-sm md:text-base uppercase tracking-luxe">
              {c.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}