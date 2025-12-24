import { PublicPageLayout } from '@/components/layout/public-page-layout';
import { ReactNode } from 'react';

export default function SctLayout({ children }: { children: ReactNode }) {
  return <PublicPageLayout>{children}</PublicPageLayout>;
}
