
'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getImageUrl } from '@/lib/utils';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, deleteDoc, doc, getDocs, query, where, writeBatch, updateDoc } from 'firebase/firestore';
import type { User } from '@/lib/types';
import { Loader, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Button } from '@/components/ui/button';
import * as React from 'react';
import { useToast } from '@/hooks/use-toast';

export default function AdminUsersPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [userToDelete, setUserToDelete] = React.useState<User | null>(null);
  const [allUsers, setAllUsers] = React.useState<User[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if(!firestore) return;
    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const usersRef = collection(firestore, 'users');
            const snapshot = await getDocs(usersRef).catch(err => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'users', operation: 'list'}));
                throw err;
            });
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            // Sort users by join date client-side
            usersData.sort((a, b) => (b.joinDate?.toMillis() || 0) - (a.joinDate?.toMillis() || 0));
            setAllUsers(usersData);
        } catch (error) {
            if (!(error instanceof FirestorePermissionError)) {
               console.error("Error fetching users:", error);
            }
            setAllUsers([]);
        } finally {
            setIsLoading(false);
        }
    }
    fetchUsers();
  }, [firestore]);

  const activeUsers = allUsers?.filter(user => user.status !== 'deleted');

  const getJoinDate = (user: any) => {
    if (user.joinDate && user.joinDate.seconds) {
      return format(new Date(user.joinDate.seconds * 1000), 'PPP');
    }
    // For users created before joinDate was added
    return 'N/A';
  };

  const handleDeleteUser = async () => {
    if (!firestore || !userToDelete) return;
    const userDocRef = doc(firestore, 'users', userToDelete.id);
    const updateData = { status: 'deleted' };

    try {
        // Soft delete: update the status to 'deleted'
        await updateDoc(userDocRef, updateData);
        
        setAllUsers(prev => prev!.map(u => u.id === userToDelete.id ? {...u, status: 'deleted'} : u));

        toast({
            title: 'User Disabled',
            description: `${userToDelete.name}'s account has been disabled and is no longer active.`,
        });
    } catch (error) {
        // Create and emit the contextual error for the developer overlay
        const permissionError = new FirestorePermissionError({
            path: userDocRef.path,
            operation: 'update',
            requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
    } finally {
        setUserToDelete(null);
    }
  };

  return (
    <>
      <AlertDialog
        open={!!userToDelete}
        onOpenChange={(open) => !open && setUserToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will disable the user account, making it inactive. 
              The user will no longer appear on the platform, but their data will be preserved for integrity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser}>
              Disable User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex items-center">
          <h1 className="font-semibold text-lg md:text-2xl">Manage Users</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Active Users</CardTitle>
            <CardDescription>
              View and manage all active users on the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <Loader className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeUsers?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage
                              src={
                                user.photoURL ||
                                getImageUrl('avatar-placeholder')
                              }
                              alt={user.name}
                              data-ai-hint="person avatar"
                            />
                            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{user.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            user.role === 'admin' ? 'destructive' : 'secondary'
                          }
                        >
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{getJoinDate(user)}</TableCell>
                      <TableCell className="text-right">
                        {user.role !== 'admin' && (
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setUserToDelete(user)}
                                >
                                Disable User
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
