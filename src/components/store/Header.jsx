import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ShoppingBag, Menu, X, User, LogOut } from 'lucide-react';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { useCart } from '@/components/cart/CartContext';
import { useAuth } from '@/lib/AuthContext';
import { BRAND } from '@/config/brand';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const LOGO = BRAND.logo;
const links = [
  { to: '/', label: 'Home' },
  { to: '/shop', label: 'Shop' },
  { to: '/bespoke', label: 'Bespoke' },
];

export default function Header() {
  const { count } = useCart();
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/70">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 h-20 md:h-24 flex items-center justify-between">
        <Link to="/" aria-label="Aurora home" className="flex items-center">
          <img src={LOGO} alt="Aurora" className="h-10 md:h-12 w-auto dark:invert" />
        </Link>
        <nav className="hidden md:flex items-center gap-12" aria-label="Main navigation">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `text-[11px] uppercase tracking-luxe transition-colors relative py-1 ${
                  isActive ? 'text-primary' : 'text-foreground/65 hover:text-foreground'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2 md:gap-3">
          <ThemeToggle />
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="p-2 text-foreground/65 hover:text-primary transition-colors" aria-label="Account menu">
                <User className="w-[18px] h-[18px]" strokeWidth={1.5} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-normal text-xs text-muted-foreground truncate max-w-[12rem]">
                  {user?.full_name || user?.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user?.role === 'admin' && <DropdownMenuItem asChild><Link to="/admin">Admin dashboard</Link></DropdownMenuItem>}
                <DropdownMenuItem onClick={() => logout()} className="text-destructive">
                  <LogOut className="w-4 h-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/login" aria-label="Log in" className="p-2 text-foreground/65 hover:text-primary transition-colors">
              <User className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </Link>
          )}
          <Link
            to="/cart"
            aria-label={`Bag, ${count} items`}
            className="relative p-2 text-foreground/65 hover:text-primary transition-colors"
          >
            <ShoppingBag className="w-[18px] h-[18px]" strokeWidth={1.5} />
            {count > 0 && (
              <span className="absolute top-0.5 right-0.5 bg-primary text-primary-foreground text-[9px] font-medium w-4 h-4 rounded-full flex items-center justify-center">
                {count}
              </span>
            )}
          </Link>
          <button className="md:hidden p-2 -mr-1" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" strokeWidth={1.5} /> : <Menu className="w-5 h-5" strokeWidth={1.5} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden border-t border-border/70 bg-background px-6 py-6 flex flex-col gap-5" aria-label="Mobile navigation">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `text-sm uppercase tracking-luxe ${isActive ? 'text-primary' : 'text-foreground/80'}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
