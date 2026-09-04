import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// The one fade/translate reveal used for section entrances throughout the
// redesign -- consistent timing/easing instead of each section hand-rolling
// its own framer-motion props. Respects prefers-reduced-motion explicitly
// (the global CSS override in index.css only zeroes CSS transition/animation
// durations, not framer-motion's JS-driven transforms).
export default function Reveal({ children, delay = 0, y = 20, className, as = 'div' }) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as] || motion.div;

  if (reduceMotion) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  );
}
