import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import { formatPrice } from '@/lib/format';

export default function ProductCard({ product }) {
  const img = product.images?.find((i) => i.featured) || product.images?.[0];
  const onSale = product.sale_price != null && product.sale_price !== '' && product.sale_price < product.price;
  const materials = product.materials || [];

  return (
    <Link to={`/product/${product.slug}`} className="group block focus-visible:outline-2 focus-visible:outline-primary">
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        {img && (
          <Image
            src={img.url}
            alt={img.alt || product.name}
            className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-[1.04]"
          />
        )}
        {product.availability === 'made_to_order' && (
          <span className="absolute top-4 left-4 text-[10px] uppercase tracking-luxe bg-background/90 backdrop-blur px-2.5 py-1.5 text-foreground">
            Made to order
          </span>
        )}
        {onSale && (
          <span className="absolute top-4 right-4 text-[10px] uppercase tracking-luxe bg-primary text-primary-foreground px-2.5 py-1.5">
            Sale
          </span>
        )}
      </div>
      <div className="pt-5">
        <h3 className="font-heading text-xl leading-snug group-hover:text-primary transition-colors">{product.name}</h3>
        {materials.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1.5 tracking-wide">{materials.join(' · ')}</p>
        )}
        <p className="text-sm mt-2.5">
          {onSale && <span className="line-through text-muted-foreground mr-2">{formatPrice(product.price)}</span>}
          <span className={onSale ? 'text-primary' : 'text-foreground'}>
            {formatPrice(onSale ? product.sale_price : product.price)}
          </span>
        </p>
      </div>
    </Link>
  );
}
