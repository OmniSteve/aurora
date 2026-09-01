import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Music2 } from 'lucide-react';

const LOGO = 'https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/5aceb367c_aurora.png';

export default function Footer() {
  return (
    <footer className="hairline mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 grid grid-cols-1 md:grid-cols-4 gap-12">
        <div>
          <img src={LOGO} alt="Aurora" className="h-14 w-auto dark:invert" />
          <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
            Custom-made jewellery, crafted by hand in our London atelier.
          </p>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-luxe text-muted-foreground mb-4">Explore</h3>
          <ul className="space-y-3 text-sm">
            <li><Link to="/shop" className="hover:text-primary transition-colors">Shop All</Link></li>
            <li><Link to="/bespoke" className="hover:text-primary transition-colors">Bespoke Commissions</Link></li>
            <li><Link to="/cart" className="hover:text-primary transition-colors">Your Cart</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-luxe text-muted-foreground mb-4">Company</h3>
          <ul className="space-y-3 text-sm">
            <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
            <li><Link to="/admin" className="hover:text-primary transition-colors">Admin</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-luxe text-muted-foreground mb-4">Contact</h3>
          <ul className="space-y-3 text-sm">
            <li><a href="mailto:atelier@aurora-jewellery.com" className="hover:text-primary transition-colors">atelier@aurora-jewellery.com</a></li>
            <li className="text-muted-foreground">12 Goldsmith Row, London</li>
          </ul>
          <div className="flex gap-4 mt-6">
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-foreground/60 hover:text-primary transition-colors"><Instagram className="w-4 h-4" /></a>
            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-foreground/60 hover:text-primary transition-colors"><Facebook className="w-4 h-4" /></a>
            <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="text-foreground/60 hover:text-primary transition-colors"><Music2 className="w-4 h-4" /></a>
          </div>
        </div>
      </div>
      <div className="hairline">
        <p className="max-w-7xl mx-auto px-4 sm:px-8 py-6 text-xs text-muted-foreground tracking-wide">
          © {new Date().getFullYear()} Aurora. All rights reserved.
        </p>
      </div>
    </footer>
  );
}