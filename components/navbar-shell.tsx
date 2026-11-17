'use client';

import Link from 'next/link';
import { createContext, useContext } from 'react';
import { BrandLogo } from './brand-logo';

type NavbarTheme = 'light' | 'dark';

const NavbarThemeContext = createContext<NavbarTheme>('light');

export function useNavbarTheme() {
  return useContext(NavbarThemeContext);
}

type NavbarShellProps = {
  children: React.ReactNode;
};

export function NavbarShell({ children }: NavbarShellProps) {
  return (
    <NavbarThemeContext.Provider value="light">
      <nav
        id="site-navbar"
        className="fixed top-0 left-0 right-0 z-[110] w-full border-b border-gray-200 bg-white"
      >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <Link href="/" className="flex min-w-0 flex-shrink-0 items-center space-x-2 sm:space-x-3">
          <BrandLogo
            variant="color"
            size={36}
            className="h-8 w-8 sm:h-9 sm:w-9"
            priority
          />
          <h1 className="text-lg font-bold text-gray-900 sm:truncate sm:text-2xl">
            <span className="sm:hidden">OSR</span>
            <span className="hidden sm:inline">OpenSourceResume</span>
          </h1>
        </Link>
        <div className="user-button-container flex-shrink-0">{children}</div>
      </div>
    </nav>
    </NavbarThemeContext.Provider>
  );
}
