
'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase';

export const PublicPageLayout = ({ children }: { children: ReactNode }) => {
  const { user } = useUser();

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-sm">
        <div className="container flex h-14 items-center">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="ml-auto flex items-center gap-4 sm:gap-6">
            {user ? (
              <Button asChild>
                <Link href="/requests">Go to App</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="hover:bg-white hover:text-black">
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Sign Up</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      {children}
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground sm:order-1 order-2 mt-2 sm:mt-0">&copy; 2025 AltMe. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6 flex-wrap justify-center sm:order-2 order-1">
          <Link href="/how-it-works" className="text-xs hover:underline underline-offset-4">
            How it Works
          </Link>
          <Link href="/terms-of-service" className="text-xs hover:underline underline-offset-4">
            Terms of Service
          </Link>
          <Link href="/privacy" className="text-xs hover:underline underline-offset-4">
            Privacy
          </Link>
          <Link href="/contact" className="text-xs hover:underline underline-offset-4">
            Contact
          </Link>
          <Link href="/legal/sct" className="text-xs hover:underline underline-offset-4">
            Legal Notice
          </Link>
        </nav>
      </footer>
    </div>
  );
};
