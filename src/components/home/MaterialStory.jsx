import React, { useMemo } from 'react';
import { Image } from '@/components/ui/image';
import { BRAND } from '@/config/brand';
import Container from '@/components/store/editorial/Container';
import Reveal from '@/components/store/editorial/Reveal';

// Cosmetic accent only (a small dot beside each material name) -- cycles
// through the storefront's muted mineral tokens by keyword match, falling
// back to a rotating index so it always looks deliberate even for a
// material name that matches nothing below.
const STONE_TOKENS = ['--stone-rose', '--stone-aqua', '--stone-amber', '--stone-clay', '--stone-smoke'];
const KEYWORD_TOKEN = [
  [/rose|pink/i, '--stone-rose'],
  [/aqua|blue|sapphire|topaz/i, '--stone-aqua'],
  [/tiger|amber|citrine|gold/i, '--stone-amber'],
  [/agate|clay|brown|wood/i, '--stone-clay'],
  [/obsidian|smoke|onyx|black/i, '--stone-smoke'],
];
function tokenFor(name, index) {
  const match = KEYWORD_TOKEN.find(([re]) => re.test(name));
  return match ? match[1] : STONE_TOKENS[index % STONE_TOKENS.length];
}

// Materials are read from whatever the catalogue actually contains
// (products.materials, already deduplicated server-side) -- never a
// hardcoded list. With a small catalogue this may show only one or two
// names; the layout is designed to hold up at any count.
export default function MaterialStory({ products }) {
  const materials = useMemo(
    () => [...new Set((products || []).flatMap((p) => p.materials || []))],
    [products],
  );
  if (materials.length === 0) return null;

  return (
    <section className="section-y bg-secondary/40 dark:bg-card">
      <Container className="grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-20 items-center">
        <Reveal className="aspect-[4/5] overflow-hidden order-2 md:order-1">
          <Image src={BRAND.heroImage} alt="Natural stones and crystals used in Aurora jewellery" className="w-full h-full object-cover" />
        </Reveal>
        <Reveal delay={0.1} className="order-1 md:order-2">
          <p className="eyebrow">Natural by Nature</p>
          <h2 className="font-heading font-light text-4xl md:text-5xl leading-[1.1] mt-4">
            Every stone, chosen by hand
          </h2>
          <p className="text-muted-foreground leading-relaxed mt-6 max-w-md">
            Aurora is built around the character of raw crystal and gemstone — each piece begins with a stone,
            not a sketch. We select for colour, clarity and the small imperfections that prove a material is real.
          </p>
          <ul className="mt-9 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            {materials.map((m, i) => (
              <li key={m} className="flex items-center gap-2.5 text-sm">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `hsl(var(${tokenFor(m, i)}))` }} aria-hidden="true" />
                {m}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
