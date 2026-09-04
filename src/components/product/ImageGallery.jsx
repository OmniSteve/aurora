import React, { useState } from 'react';
import { Image } from '@/components/ui/image';

export default function ImageGallery({ images = [], name }) {
  const ordered = [...images].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const current = ordered[active];

  if (!current) return <div className="aspect-[4/5] bg-muted" />;

  return (
    <div>
      <div
        className="relative aspect-[4/5] overflow-hidden bg-muted cursor-zoom-in"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
        }}
        onMouseEnter={() => setZoom(true)}
        onMouseLeave={() => setZoom(false)}
      >
        <Image
          src={current.url}
          alt={current.alt || name}
          className="w-full h-full object-cover transition-transform duration-300"
          style={{ transform: zoom ? 'scale(1.8)' : 'scale(1)', transformOrigin: origin }}
        />
      </div>
      {ordered.length > 1 && (
        <div className="flex gap-3 mt-4" role="tablist" aria-label="Product images">
          {ordered.map((img, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === active}
              aria-label={`View image ${i + 1}`}
              onClick={() => setActive(i)}
              className={`w-16 h-16 overflow-hidden border transition-colors ${
                i === active ? 'border-primary' : 'border-border hover:border-foreground/40'
              }`}
            >
              <Image src={img.url} alt={img.alt || `${name} ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}