import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import { BRAND } from '@/config/brand';
import Container from '@/components/store/editorial/Container';
import SectionHeading from '@/components/store/editorial/SectionHeading';
import Reveal from '@/components/store/editorial/Reveal';

// Varied tile sizing for an editorial (not Instagram-chrome) mosaic feel --
// cycles regardless of how many tiles actually render, so it still reads as
// deliberate with a small catalogue.
const SPANS = ['md:col-span-2 md:row-span-2', '', '', 'md:row-span-2', '', ''];

// Sourced entirely from real catalogue imagery (each product's featured
// photo) plus Aurora's own branding shots as filler when the catalogue is
// still small -- never placeholder/stock imagery. Product tiles link to
// that product; branding tiles link to the shop.
export default function VisualGallery({ products }) {
  const tiles = useMemo(() => {
    const fromProducts = (products || [])
      .map((p) => {
        const img = p.images?.find((i) => i.featured) || p.images?.[0];
        return img ? { key: p.id, url: img.url, alt: img.alt || p.name, to: `/product/${p.slug}` } : null;
      })
      .filter(Boolean);
    const filler = [
      { key: 'hero', url: BRAND.heroImage, alt: 'Aurora jewellery', to: '/shop' },
      { key: 'bespoke', url: BRAND.bespokeImage, alt: 'The Aurora atelier', to: '/bespoke' },
    ];
    const combined = [...fromProducts, ...filler.filter((f) => !fromProducts.some((p) => p.url === f.url))];
    return combined.slice(0, 6);
  }, [products]);

  if (tiles.length === 0) return null;

  return (
    <section className="section-y">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="From the Atelier" title="Aurora, in the wild" className="mb-14" />
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[180px] md:auto-rows-[220px] gap-3 md:gap-4">
          {tiles.map((tile, i) => (
            <Reveal key={tile.key} delay={Math.min(i, 4) * 0.06} className={`group relative overflow-hidden ${SPANS[i % SPANS.length]}`}>
              <Link to={tile.to} className="block w-full h-full">
                <Image
                  src={tile.url}
                  alt={tile.alt}
                  className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-[1.05]"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
