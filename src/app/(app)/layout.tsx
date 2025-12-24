'use client';

import { AppShell } from '@/components/layout/app-shell';
import { ReactNode } from 'react';

// This is a route group, which means it will apply to all routes under this directory
// except for routes that have their own layout.

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // The useUser hook is now called within AppShell, so we don't need to block rendering here.
  // This improves page transition performance.
  return (
    <AppShell>{children}</AppShell>
  );
}
