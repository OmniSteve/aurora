import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Image } from '@/components/ui/image';
import { BRAND } from '@/config/brand';

const HERO = BRAND.heroImage;

export default function Hero() {
  const reduceMotion = useReducedMotion();
  const rise = (delay) => (reduceMotion ? {} : {
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] },
  });

  return (
    <section className="relative h-[86vh] min-h-[600px] overflow-hidden">
      <Image src={HERO} alt="Aurora jewellery on natural stone and wood" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/25" />
      <div className="relative z-10 h-full flex flex-col items-center justify-end pb-20 md:pb-28 text-center px-6">
        <motion.p {...rise(0)} className="text-[11px] uppercase tracking-luxe text-white/80">Aurora</motion.p>
        <motion.h1 {...rise(0.1)} className="mt-5 font-heading text-4xl md:text-6xl font-light text-white max-w-2xl leading-[1.1]">
          Jewellery shaped by nature
        </motion.h1>
        <motion.p {...rise(0.2)} className="mt-5 text-white/80 max-w-md text-[15px] leading-relaxed">
          Handcrafted crystal and stone pieces, created to tell your story.
        </motion.p>
        <motion.div {...rise(0.3)} className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link to="/shop" className="btn-primary">Explore the Collection</Link>
          <Link to="/bespoke" className="inline-flex items-center justify-center gap-2 border border-white/50 text-white px-9 py-4 text-[11px] uppercase tracking-luxe hover:bg-white/10 transition-colors">
            Create Something Bespoke
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
