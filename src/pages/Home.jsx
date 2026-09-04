import React, { useEffect, useState } from 'react';
import { api } from '@/api/aurora';
import Hero from '@/components/home/Hero';
import ProductRow from '@/components/home/ProductRow';
import MaterialStory from '@/components/home/MaterialStory';
import BespokeSection from '@/components/home/BespokeSection';
import BrandStory from '@/components/home/BrandStory';
import VisualGallery from '@/components/home/VisualGallery';

export default function Home() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    api.products.listPublished().then(setProducts);
  }, []);

  const featured = products.filter((p) => p.featured);

  return (
    <div>
      <Hero />
      <ProductRow eyebrow="Signature" title="Featured Pieces" products={featured.length ? featured : products} />
      <MaterialStory products={products} />
      <BespokeSection />
      <BrandStory />
      <VisualGallery products={products} />
    </div>
  );
}
