import { PublicPageLayout } from '@/components/layout/public-page-layout';
import { ReactNode } from "react";

// This is a public layout, it does not use the AppShell
export default function PublicLayout({ children }: { children: ReactNode }) {
    return <PublicPageLayout>{children}</PublicPageLayout>;
}
