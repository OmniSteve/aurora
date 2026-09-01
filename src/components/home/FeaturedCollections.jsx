import React from 'react';
import { Link } from 'react-router-dom';
import Image from '@/components/ui/image';

export default function FeaturedCollections({ collections }) {
  if (!collections?.length) return null;
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8 py-[10vh]">
      <p className="text-xs uppercase tracking-luxe text-primary text-center">Curated</p>
      <h2 className="text-3xl md:text-5xl font-light text-center mt-3 mb-14">Featured Collections</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {collections.slice(0, 3).map((c) => (
          <Link key={c.id} to={`/shop?collection=${c.id}`} className="group relative aspect-[3/4] overflow-hidden block">
            <Image
              src={c.hero_image}
              alt={c.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
              <h3 className="text-2xl font-heading">{c.name}</h3>
              <p className="text-sm text-white/75 mt-1 line-clamp-2">{c.description}</p>
              <span className="inline-block mt-4 text-[11px] uppercase tracking-luxe border-b border-primary pb-1">
                Explore
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}