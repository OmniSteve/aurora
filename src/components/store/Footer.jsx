import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Music2 } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { api } from '@/api/aurora';
import Container from '@/components/store/editorial/Container';
import { Input } from '@/components/ui/input';

const LOGO = BRAND.logo;

export default function Footer() {
  const [settings, setSettings] = useState(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    api.settings.get().then(setSettings).catch(() => {});
  }, []);

  const subscribe = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    setStatus('sending');
    await api.newsletter.subscribe(email);
    setStatus('done');
    setEmail('');
  };

  const contactEmail = settings?.email || null;
  const socials = [
    settings?.instagram && { href: settings.instagram, label: 'Instagram', Icon: Instagram },
    settings?.facebook && { href: settings.facebook, label: 'Facebook', Icon: Facebook },
    settings?.tiktok && { href: settings.tiktok, label: 'TikTok', Icon: Music2 },
  ].filter(Boolean);

  return (
    <footer className="mt-32 bg-secondary/40 dark:bg-card border-t border-border/70">
      <Container className="py-20 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-16">
        <div>
          <img src={LOGO} alt="Aurora" className="h-10 w-auto dark:invert" />
          <p className="font-heading text-2xl font-light leading-snug mt-6 max-w-xs">
            Join the list for new pieces and atelier stories.
          </p>
          {status === 'done' ? (
            <p className="mt-6 text-primary text-sm" role="status">Thank you — you're on the list.</p>
          ) : (
            <form onSubmit={subscribe} className="mt-6 flex gap-3 max-w-sm">
              <label htmlFor="footer-newsletter-email" className="sr-only">Email address</label>
              <Input
                id="footer-newsletter-email"
                type="email"
                required
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-background"
              />
              <button type="submit" disabled={status === 'sending'} className="btn-dark h-11 px-6 flex-shrink-0">
                {status === 'sending' ? '…' : 'Join'}
              </button>
            </form>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-10">
          <div>
            <h3 className="eyebrow mb-4">Explore</h3>
            <ul className="space-y-3 text-sm">
              <li><Link to="/shop" className="hover:text-primary transition-colors">Shop All</Link></li>
              <li><Link to="/bespoke" className="hover:text-primary transition-colors">Bespoke</Link></li>
              <li><Link to="/cart" className="hover:text-primary transition-colors">Your Bag</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="eyebrow mb-4">Legal</h3>
            <ul className="space-y-3 text-sm">
              <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link to="/admin" className="hover:text-primary transition-colors">Admin</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="eyebrow mb-4">Contact</h3>
            {contactEmail && (
              <a href={`mailto:${contactEmail}`} className="text-sm hover:text-primary transition-colors break-all">
                {contactEmail}
              </a>
            )}
            {socials.length > 0 && (
              <div className="flex gap-4 mt-5">
                {socials.map(({ href, label, Icon }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="text-foreground/55 hover:text-primary transition-colors">
                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </Container>
      <div className="border-t border-border/70">
        <Container>
          <p className="py-6 text-xs text-muted-foreground tracking-wide">
            © {new Date().getFullYear()} Aurora. Handcrafted with natural stone and gold.
          </p>
        </Container>
      </div>
    </footer>
  );
}
