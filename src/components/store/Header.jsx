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
    <header className="sticky top-0 z-50 backdrop-blur-2xl bg-background/75 border-b border-border/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 md:h-20 flex items-center justify-between">
        <Link to="/" aria-label="Aurora home" className="flex items-center">
          <img src={LOGO} alt="Aurora" className="h-12 md:h-14 w-auto dark:invert" />
        </Link>
        <nav className="hidden md:flex items-center gap-10" aria-label="Main navigation">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `text-xs uppercase tracking-luxe transition-colors ${
                  isActive ? 'text-primary' : 'text-foreground/70 hover:text-foreground'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="p-2 text-foreground/70 hover:text-primary transition-colors" aria-label="Account menu">
                <User className="w-4 h-4" />
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
            <Link to="/login" aria-label="Log in" className="p-2 text-foreground/70 hover:text-primary transition-colors">
              <User className="w-4 h-4" />
            </Link>
          )}
          <Link
            to="/cart"
            aria-label={`Shopping cart, ${count} items`}
            className="relative p-2 text-foreground/70 hover:text-primary transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                {count}
              </span>
            )}
          </Link>
          <button className="md:hidden p-2" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden border-t border-border/60 bg-background px-6 py-5 flex flex-col gap-4" aria-label="Mobile navigation">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="text-sm uppercase tracking-luxe text-foreground/80"
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}