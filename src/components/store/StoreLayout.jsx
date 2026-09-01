import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '@/components/store/Header';
import Footer from '@/components/store/Footer';
import { initTheme } from '@/lib/theme';

export default function StoreLayout() {
  useEffect(() => {
    initTheme();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}