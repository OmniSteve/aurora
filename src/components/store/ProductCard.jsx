import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import { formatPrice } from '@/lib/format';

export default function ProductCard({ product }) {
  const img = product.images?.find((i) => i.featured) || product.images?.[0];
  const onSale = product.sale_price != null && product.sale_price !== '' && product.sale_price < product.price;

  return (
    <Link to={`/product/${product.slug}`} className="group block focus-visible:outline-2 focus-visible:outline-primary">
      <div className="relative aspect-square overflow-hidden bg-muted">
        {img && (
          <Image
            src={img.url}
            alt={img.alt || product.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        )}
        {product.availability === 'made_to_order' && (
          <span className="absolute top-3 left-3 text-[10px] uppercase tracking-luxe bg-background/85 backdrop-blur px-2 py-1">
            Made to order
          </span>
        )}
        {onSale && (
          <span className="absolute top-3 right-3 text-[10px] uppercase tracking-luxe bg-primary text-primary-foreground px-2 py-1">
            Sale
          </span>
        )}
      </div>
      <div className="pt-4 text-center">
        <h3 className="font-heading text-lg leading-snug">{product.name}</h3>
        <p className="text-sm mt-1">
          {onSale && <span className="line-through text-muted-foreground mr-2">{formatPrice(product.price)}</span>}
          <span className={onSale ? 'text-primary' : 'text-muted-foreground'}>
            {formatPrice(onSale ? product.sale_price : product.price)}
          </span>
        </p>
      </div>
    </Link>
  );
}