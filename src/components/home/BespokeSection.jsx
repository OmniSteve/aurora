import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';

const IMG = 'https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/85e389944_generated_image.png';

export default function BespokeSection() {
  return (
    <section className="bg-secondary/50 dark:bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-[10vh] grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="aspect-[4/3] overflow-hidden order-2 md:order-1">
          <Image src={IMG} alt="A jeweller setting an emerald into a gold ring" className="w-full h-full object-cover" />
        </div>
        <div className="order-1 md:order-2">
          <p className="text-xs uppercase tracking-luxe text-primary">The Atelier</p>
          <h2 className="text-3xl md:text-5xl font-light mt-3 leading-tight">Bespoke, from a single sketch</h2>
          <p className="text-muted-foreground mt-6 leading-relaxed">
            Bring us an idea, an heirloom, or nothing more than a feeling. Our designers work with you from first
            sketch to final polish — selecting stones, metals and proportions that belong to you alone.
          </p>
          <Link
            to="/bespoke"
            className="inline-block mt-8 px-10 py-4 bg-foreground text-background text-xs uppercase tracking-luxe hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            Start Your Commission
          </Link>
        </div>
      </div>
    </section>
  );
}