import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingBag, Gem, Settings, ArrowLeft, LogOut, Menu, X } from 'lucide-react';
import { api } from '@/api/aurora';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { initTheme } from '@/lib/theme';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/admin/bespoke', label: 'Bespoke', icon: Gem },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const [user, setUser] = useState(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    initTheme();
    api.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="text-3xl font-light">Admin access required</h1>
        <p className="text-muted-foreground mt-3 text-sm">This area is reserved for Aurora administrators.</p>
        <Link to="/" className="mt-8 px-8 py-3 border border-border text-xs uppercase tracking-luxe hover:border-primary transition-colors">
          Return to the store
        </Link>
      </div>
    );
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-4" aria-label="Admin navigation">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors rounded-sm ${
              isActive ? 'bg-primary/15 text-primary' : 'text-foreground/70 hover:bg-accent'
            }`
          }
        >
          <Icon className="w-4 h-4" /> {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-60 flex-col border-r border-border sticky top-0 h-screen">
        <div className="p-5 border-b border-border">
          <p className="font-heading text-2xl">Aurora</p>
          <p className="text-[10px] uppercase tracking-luxe text-muted-foreground">Command Center</p>
        </div>
        {nav}
        <div className="mt-auto p-4 border-t border-border space-y-1">
          <Link to="/" className="flex items-center gap-3 px-4 py-2 text-sm text-foreground/70 hover:bg-accent rounded-sm">
            <ArrowLeft className="w-4 h-4" /> View store
          </Link>
          <button onClick={() => api.auth.logout()} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-foreground/70 hover:bg-accent rounded-sm">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur flex items-center justify-between px-4 md:px-8 h-14">
          <button className="md:hidden p-2" aria-label="Toggle admin menu" onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <p className="text-sm text-muted-foreground hidden md:block">Signed in as {user.email}</p>
          <ThemeToggle />
        </header>
        {open && <div className="md:hidden border-b border-border bg-background">{nav}</div>}
        <main className="p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}