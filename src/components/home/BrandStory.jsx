import React from 'react';

export default function BrandStory() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-[10vh] text-center">
      <p className="text-xs uppercase tracking-luxe text-primary">Our Story</p>
      <h2 className="text-3xl md:text-4xl font-light mt-3">Born of light, shaped by hand</h2>
      <p className="text-muted-foreground mt-8 leading-loose">
        Aurora began at a single workbench in London, where our founder set her first stone by the light of a north-facing
        window. A decade later, every piece still passes through the same hands — cut, cast, set and finished in our
        atelier. We believe jewellery should never be anonymous. It should carry a name, a date, a story. That is why
        nothing we make is truly finished until it is made yours.
      </p>
      <div className="hairline w-24 mx-auto mt-12" />
    </section>
  );
}