import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import { BRAND } from '@/config/brand';
import Container from '@/components/store/editorial/Container';
import Reveal from '@/components/store/editorial/Reveal';

const IMG = BRAND.bespokeImage;

export default function BespokeSection() {
  return (
    <section className="section-y bg-foreground text-background dark:bg-card dark:text-card-foreground">
      <Container className="grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-20 items-center">
        <Reveal>
          <p className="eyebrow">The Atelier</p>
          <h2 className="font-heading font-light text-4xl md:text-5xl leading-[1.1] mt-4">Created for you.</h2>
          <p className="mt-6 max-w-md leading-relaxed opacity-75">
            Bring a stone, a feeling, or nothing at all. Aurora designs bespoke pieces from selected crystals,
            gemstones and metal combinations — worked by hand from a first sketch to the final polish, so what
            you receive belongs to no one else.
          </p>
          <Link to="/bespoke" className="btn-primary mt-9">Create Something Bespoke</Link>
        </Reveal>
        <Reveal delay={0.1} className="aspect-[4/3] overflow-hidden">
          <Image src={IMG} alt="A jeweller setting a stone by hand" className="w-full h-full object-cover" />
        </Reveal>
      </Container>
    </section>
  );
}
