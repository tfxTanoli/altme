

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Camera,
  Home,
  Briefcase,
  Search,
  MessageSquare,
  User,
  CreditCard,
  Settings,
  LogOut,
  PlusCircle,
  Loader,
  Shield,
  Users,
  LayoutGrid,
  Inbox,
  Flag,
  Heart,
  DollarSign,
  Star,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  useSidebar,
  SidebarMenuBadge,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { getImageUrl } from '@/lib/utils';
import { useAuth, useUser, useFirestore, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, collection, query, where, getDocs, getDoc, onSnapshot } from 'firebase/firestore';
import type { ProjectRequest, User as AppUser, ChatRoom } from '@/lib/types';
import { NotificationBell } from '../notifications/notification-bell';
import { EmailVerificationScreen } from '@/components/auth/email-verification-screen';


const projectNavItems = [
  { href: '/requests', label: 'My Jobs', icon: Briefcase, roles: ['user'] },
  { href: '/messages', label: 'Messages', icon: MessageSquare, roles: ['user'] },
];

const discoverNavItems = [
    { href: '/photographers', label: 'Browse Photographers', icon: Camera, roles: ['user'] },
    { href: '/requests/browse', label: 'Browse Projects', icon: Search, roles: ['user'] },
];


const accountNavItems = [
    { href: '/profile', label: 'Profile', icon: User, roles: ['user'] },
    { href: '/favorites', label: 'Favorites', icon: Heart, roles: ['user'] },
    { href: '/earnings', label: 'Earnings', icon: DollarSign, roles: ['user'] },
    { href: '/settings', label: 'Settings', icon: Settings, roles: ['user'] },
];

const adminNavItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid, roles: ['admin'] },
    { href: '/admin/projects', label: 'Projects', icon: Briefcase, roles: ['admin'] },
    { href: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
    { href: '/admin/chats', label: 'Chats', icon: MessageSquare, roles: ['admin'] },
    { href: '/admin/payouts', label: 'Payouts', icon: DollarSign, roles: ['admin'] },
    { href: '/admin/inbox', label: 'Inbox', icon: Inbox, roles: ['admin'] },
    { href: '/admin/reports', label: 'Reports', icon: Flag, roles: ['admin'] },
    { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];


function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const [userData, setUserData] = React.useState<AppUser | null>(null);
  const [isUserDataLoading, setIsUserDataLoading] = React.useState(true);

  React.useEffect(() => {
    if (!firestore || !user) {
      if (!isUserLoading) setIsUserDataLoading(false);
      return;
    }

    setIsUserDataLoading(true);
    const userDocRef = doc(firestore, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        setUserData(doc.data() as AppUser);
      }
      setIsUserDataLoading(false);
    }, (error) => {
      console.error("Error listening to user data:", error);
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `users/${'user.uid'}`,
        operation: 'get',
      }));
      setIsUserDataLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user, isUserLoading]);

  const userRole = userData?.role || 'user';

  const handleLinkClick = React.useCallback(() => {
    if (setOpenMobile) {
      setOpenMobile(false);
    }
  }, [setOpenMobile]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Logout Error:', error);
    }
  };

  const isNavItemActive = React.useCallback((itemHref: string) => {
    if (itemHref === '/requests') {
        return pathname === '/requests';
    }
    if (itemHref !== '/' && pathname.startsWith(itemHref)) {
        return true;
    }
    return false;
  }, [pathname]);

  if (isUserLoading || isUserDataLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const filteredAdminNavItems = adminNavItems.filter(item => item.roles.includes(userRole));
  
  return (
    <>
      <Sidebar>
        <SidebarHeader>
            <div
              className={cn(
                'flex items-center gap-2 p-2 transition-all',
                'group-data-[collapsible=icon]:-ml-2 group-data-[collapsible=icon]:-mt-2 group-data-[collapsible=icon]:p-0'
              )}
            >
              <div className="group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:left-1/2 group-data-[collapsible=icon]:top-3.5 group-data-[collapsible=icon]:-translate-x-1/2">
                <Logo />
              </div>
              <span className="duration-200 group-data-[collapsible=icon]:opacity-0">
              </span>
            </div>
        </SidebarHeader>
        <SidebarContent>
            <div>
              {userRole !== 'admin' && (
                <div className="p-2">
                    <Button asChild className="w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:p-0">
                        <Link href="/requests/new" onClick={handleLinkClick}>
                        <PlusCircle className="h-4 w-4" />
                        <span className="group-data-[collapsible=icon]:hidden">
                            New Request
                        </span>
                        </Link>
                    </Button>
                </div>
              )}
               
               {userRole === 'user' && (
                    <SidebarMenu>
                         <SidebarMenuItem className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                            Projects
                        </SidebarMenuItem>
                        {projectNavItems.map((item) => (
                            <SidebarMenuItem key={item.href}>
                                <Link href={item.href} onClick={handleLinkClick} className="relative">
                                <SidebarMenuButton
                                    isActive={isNavItemActive(item.href)}
                                    tooltip={item.label}
                                >
                                    <item.icon />
                                    <span>{item.label}</span>
                                </SidebarMenuButton>
                                </Link>
                            </SidebarMenuItem>
                        ))}
                        <SidebarSeparator />
                        <SidebarMenuItem className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                            Discover
                        </SidebarMenuItem>
                        {discoverNavItems.map((item) => (
                            <SidebarMenuItem key={item.href}>
                                <Link href={item.href} onClick={handleLinkClick} className="relative">
                                <SidebarMenuButton
                                    isActive={isNavItemActive(item.href)}
                                    tooltip={item.label}
                                >
                                    <item.icon />
                                    <span>{item.label}</span>
                                </SidebarMenuButton>
                                </Link>
                            </SidebarMenuItem>
                        ))}
                        <SidebarSeparator />
                         <SidebarMenuItem className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                            Account
                        </SidebarMenuItem>
                        {accountNavItems.map((item) => (
                            <SidebarMenuItem key={item.href}>
                                <Link href={item.href} onClick={handleLinkClick} className="relative">
                                <SidebarMenuButton
                                    isActive={isNavItemActive(item.href)}
                                    tooltip={item.label}
                                >
                                    <item.icon />
                                    <span>{item.label}</span>
                                </SidebarMenuButton>
                                </Link>
                            </SidebarMenuItem>
                        ))}
                        <SidebarSeparator />
                        <SidebarMenuItem>
                            <SidebarMenuButton onClick={handleLogout} tooltip="Logout">
                                <LogOut />
                                <span>Logout</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
               )}
               

                 {userRole === 'admin' && (
                    <>
                        <SidebarMenu>
                             <SidebarMenuItem className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                                Admin
                            </SidebarMenuItem>
                            {filteredAdminNavItems.map((item) => (
                                <SidebarMenuItem key={item.href}>
                                    <Link href={item.href} onClick={handleLinkClick} className="relative">
                                    <SidebarMenuButton
                                        isActive={isNavItemActive(item.href)}
                                        tooltip={item.label}
                                    >
                                        <item.icon />
                                        <span>{item.label}</span>
                                    </SidebarMenuButton>
                                    </Link>
                                </SidebarMenuItem>
                            ))}
                            <SidebarSeparator />
                            <SidebarMenuItem>
                                <SidebarMenuButton onClick={handleLogout} tooltip="Logout">
                                    <LogOut />
                                    <span>Logout</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </>
                )}
            </div>
            <div>
               
            </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-2 p-2">
            <Link href="/profile" className="flex items-center gap-2 flex-1 overflow-hidden">
                <Avatar className="h-8 w-8">
                {user?.photoURL && <AvatarImage src={'user.photoURL'} alt="User" />}
                <AvatarFallback>{user?.displayName?.charAt(0) || user?.email?.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium duration-200 group-data-[collapsible=icon]:opacity-0 truncate">
                {user?.displayName || user?.email}
                </span>
            </Link>
             <div className="duration-200 group-data-[collapsible=icon]:opacity-0">
                <NotificationBell />
             </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <SidebarTrigger className="h-8 w-8 md:hidden" variant="ghost" />
          <div className="relative ml-auto flex items-center gap-4">
          </div>
        </header>
        {children}
        <footer className="mt-auto flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
          <p className="text-xs text-muted-foreground sm:order-1 order-2 mt-2 sm:mt-0">&copy; 2025 AltMe. All rights reserved.</p>
          <nav className="sm:ml-auto flex gap-4 sm:gap-6 flex-wrap justify-center sm:order-2 order-1">
            <Link href="/how-it-works" className="text-xs hover:underline underline-offset-4" prefetch={false}>
              How it Works
            </Link>
            <Link href="/terms-of-service" className="text-xs hover:underline underline-offset-4" prefetch={false}>
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-xs hover:underline underline-offset-4" prefetch={false}>
              Privacy
            </Link>
            <Link href="/contact" className="text-xs hover:underline underline-offset-4" prefetch={false}>
              Contact
            </Link>
            <Link href="/legal/sct" className="text-xs hover:underline underline-offset-4" prefetch={false}>
              Legal Notice
            </Link>
            <Link href="https://x.com" target="_blank" rel="noopener noreferrer" className="text-xs hover:underline underline-offset-4">
                X
            </Link>
          </nav>
        </footer>
      </SidebarInset>
    </>
  );
}


function AppShellLogic({ children }: { children: React.ReactNode }) {
    const { user, isUserLoading } = useUser();
    const [userRole, setUserRole] = React.useState<string | null>(null);
    const [isRoleLoading, setIsRoleLoading] = React.useState(true);
    const firestore = useFirestore();

    React.useEffect(() => {
        if (isUserLoading) {
            return;
        }
        if (!user) {
            setIsRoleLoading(false);
            setUserRole(null);
            return;
        }

        const userDocRef = doc(firestore, 'users', user.uid);
        const unsubscribe = onSnapshot(userDocRef, (doc) => {
            if (doc.exists()) {
                setUserRole(doc.data().role);
            }
            setIsRoleLoading(false);
        }, (error) => {
            console.error("Error fetching user role:", error);
            setIsRoleLoading(false);
        });

        return () => unsubscribe();
    }, [user, isUserLoading, firestore]);

    if (isUserLoading || isRoleLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    // If a user exists, check if their email is verified, unless they are an admin.
    if (user) {
        if (!user.emailVerified && userRole !== 'admin') {
            return <EmailVerificationScreen />;
        }
        // If verified OR an admin, show the full app shell.
        return (
             <SidebarProvider>
                <AppShellContent>{children}</AppShellContent>
            </SidebarProvider>
        );
    }

    // If no user, and not loading, it implies the child is a public page.
    return <>{children}</>;
}


export function AppShell({ children }: { children: React.ReactNode }) {
    return <AppShellLogic>{children}</AppShellLogic>;
}
