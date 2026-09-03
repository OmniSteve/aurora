import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Music2 } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { api } from '@/api/aurora';

const LOGO = BRAND.logo;

export default function Footer() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.settings.get().then(setSettings).catch(() => {});
  }, []);

  const email = settings?.email || null;
  const address = settings?.address || null;
  const socials = [
    settings?.instagram && { href: settings.instagram, label: 'Instagram', Icon: Instagram },
    settings?.facebook && { href: settings.facebook, label: 'Facebook', Icon: Facebook },
    settings?.tiktok && { href: settings.tiktok, label: 'TikTok', Icon: Music2 },
  ].filter(Boolean);

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
            {email && <li><a href={`mailto:${email}`} className="hover:text-primary transition-colors">{email}</a></li>}
            {address && <li className="text-muted-foreground">{address}</li>}
          </ul>
          {socials.length > 0 && (
            <div className="flex gap-4 mt-6">
              {socials.map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="text-foreground/60 hover:text-primary transition-colors">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          )}
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