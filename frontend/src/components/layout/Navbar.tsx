'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/exchange', label: 'Exchange' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-30 glass border-b border-dark-700/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">K</span>
            </div>
            <span className="text-xl font-bold text-dark-50">
              KAIRO<span className="text-primary-400">DeFi</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
                    ? 'text-primary-400 bg-primary-500/10'
                    : 'text-dark-300 hover:text-dark-100 hover:bg-dark-800',
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Connect + Mobile toggle */}
          <div className="flex items-center gap-3">
            <ConnectButton
              chainStatus="icon"
              accountStatus="avatar"
              showBalance={false}
            />
            <button
              className="md:hidden p-2 rounded-lg hover:bg-dark-800 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? (
                <XMarkIcon className="w-5 h-5 text-dark-300" />
              ) : (
                <Bars3Icon className="w-5 h-5 text-dark-300" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-dark-700/50 px-4 py-3 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'block px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
                  ? 'text-primary-400 bg-primary-500/10'
                  : 'text-dark-300 hover:text-dark-100 hover:bg-dark-800',
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
