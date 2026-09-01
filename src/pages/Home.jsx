import React, { useEffect, useState } from 'react';
import { api } from '@/api/aurora';
import Hero from '@/components/home/Hero';
import FeaturedCollections from '@/components/home/FeaturedCollections';
import ProductRow from '@/components/home/ProductRow';
import BespokeSection from '@/components/home/BespokeSection';
import BrandStory from '@/components/home/BrandStory';
import Testimonials from '@/components/home/Testimonials';
import CategoryGrid from '@/components/home/CategoryGrid';
import Newsletter from '@/components/home/Newsletter';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [collections, setCollections] = useState([]);

  useEffect(() => {
    api.products.listPublished().then(setProducts);
    api.categories.listPublished().then(setCategories);
    api.collections.listPublished().then(setCollections);
  }, []);

  return (
    <div>
      <Hero />
      <FeaturedCollections collections={collections.filter((c) => c.featured)} />
      <ProductRow eyebrow="Signature" title="Featured Jewellery" products={products.filter((p) => p.featured)} />
      <BespokeSection />
      <ProductRow eyebrow="Just Arrived" title="New Arrivals" products={products.filter((p) => p.new_arrival)} />
      <BrandStory />
      <Testimonials />
      <CategoryGrid categories={categories} />
      <Newsletter />
    </div>
  );
}