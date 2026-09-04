import React from 'react';
import { cn } from '@/lib/utils';

// Eyebrow + serif heading + optional supporting copy -- the recurring
// editorial header pattern used to open nearly every storefront section.
export default function SectionHeading({ eyebrow, title, description, align = 'center', className, titleClassName }) {
  const alignClass = align === 'left' ? 'text-left items-start' : 'text-center items-center mx-auto';
  return (
    <div className={cn('flex flex-col max-w-2xl', alignClass, className)}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className={cn('font-heading font-light text-4xl md:text-5xl leading-[1.1] mt-4', titleClassName)}>{title}</h2>
      {description && <p className="text-muted-foreground leading-relaxed mt-5">{description}</p>}
    </div>
  );
}
