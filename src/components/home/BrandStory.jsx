import React from 'react';
import Container from '@/components/store/editorial/Container';
import Reveal from '@/components/store/editorial/Reveal';

const VALUES = ['Handcrafted by hand', 'Natural stones only', 'Made to order'];

// "Atelier / Craft" -- deliberately text-forward rather than another large
// photograph: the hero and bespoke sections either side already carry the
// page's imagery, so this section varies the rhythm instead of repeating it.
export default function BrandStory() {
  return (
    <section className="section-y">
      <Container className="max-w-3xl text-center">
        <Reveal>
          <p className="eyebrow">Our Craft</p>
          <h2 className="font-heading font-light text-4xl md:text-5xl leading-[1.15] mt-4">
            Born of light, shaped by hand
          </h2>
          <p className="text-muted-foreground mt-8 leading-loose">
            Every Aurora piece passes through the same hands — cut, set and finished in small batches rather
            than mass production. We work with raw crystal and gemstone the way they arrive from the earth,
            so no two pieces are ever quite identical. Jewellery, we think, should carry a little of where it came from.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="hairline w-16 mx-auto mt-12 mb-8" />
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[11px] uppercase tracking-luxe text-muted-foreground">
            {VALUES.map((v) => <li key={v}>{v}</li>)}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
