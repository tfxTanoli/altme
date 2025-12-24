
'use client';

import { useUser, useFirestore, updateDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, getDoc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';
import { Loader, Shield } from 'lucide-react';
import AdminDashboard from '@/components/dashboard/admin-dashboard';
import { useEffect, useState } from 'react';
import type { User as AppUser } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';


export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [userData, setUserData] = useState<AppUser | null>(null);
  const [isCheckingRole, setIsCheckingRole] = useState(true);

  useEffect(() => {
    if (!user || !firestore) {
      if (!isUserLoading) {
        setIsCheckingRole(false);
      }
      return;
    }

    const fetchUserRole = async () => {
      setIsCheckingRole(true);
      const userDocRef = doc(firestore, 'users', user.uid);
      try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          setUserData(docSnap.data() as AppUser);
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
      } finally {
        setIsCheckingRole(false);
      }
    };

    fetchUserRole();
  }, [user, firestore, isUserLoading]);


  if (isUserLoading || isCheckingRole) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader className="h-8 w-8 animate-spin" />
      </main>
    );
  }

  if (userData?.role === 'admin') {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="space-y-8">
            <AdminDashboard />
        </div>
      </main>
    );
  }
  
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 md:gap-8 md:p-8">
        <div className="mx-auto grid w-full max-w-4xl items-center justify-center gap-6 text-center">
            <div className="flex flex-col items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <Shield className="h-8 w-8" />
                </div>
                <h1 className="text-2xl font-bold">Access Denied</h1>
                <p className="text-muted-foreground">You do not have permission to view this page.</p>
            </div>
        </div>
    </main>
  )
}
