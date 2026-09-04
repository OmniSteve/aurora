import React from 'react';
import { cn } from '@/lib/utils';

// The one shared max-width/padding wrapper for storefront sections --
// previously every section repeated `max-w-7xl mx-auto px-4 sm:px-8`
// (or a slightly different variant) inline.
export default function Container({ as: Tag = 'div', className, children, ...props }) {
  return (
    <Tag className={cn('max-w-7xl mx-auto px-6 sm:px-8 lg:px-10', className)} {...props}>
      {children}
    </Tag>
  );
}
