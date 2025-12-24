import { PublicPageLayout } from '@/components/layout/public-page-layout';
import { ReactNode } from 'react';

export default function ContactLayout({ children }: { children: ReactNode }) {
  return <PublicPageLayout>{children}</PublicPageLayout>;
}
