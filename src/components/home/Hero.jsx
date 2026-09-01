import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Image from '@/components/ui/image';

const HERO = 'https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/ff194d237_generated_image.png';
const LOGO = 'https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/5aceb367c_aurora.png';

export default function Hero() {
  return (
    <section className="relative h-[92vh] min-h-[560px] overflow-hidden">
      <Image src={HERO} alt="Molten gold flowing over black stone" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
        <motion.img
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          src={LOGO}
          alt="Aurora"
          className="h-28 md:h-36 w-auto bg-white p-4 shadow-2xl"
        />
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="mt-10 text-4xl md:text-6xl font-light text-white max-w-3xl leading-tight"
        >
          Jewellery made only for you
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="mt-5 text-white/80 max-w-xl font-body text-base leading-relaxed"
        >
          Every Aurora piece is designed around you — your story, your stones, your hands.
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="mt-10 flex flex-col sm:flex-row gap-4"
        >
          <Link
            to="/shop"
            className="px-10 py-4 bg-primary text-primary-foreground text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors"
          >
            Discover the Collection
          </Link>
          <Link
            to="/bespoke"
            className="px-10 py-4 border border-white/50 text-white text-xs uppercase tracking-luxe hover:bg-white/10 transition-colors"
          >
            Begin a Bespoke Commission
          </Link>
        </motion.div>
      </div>
    </section>
  );
}