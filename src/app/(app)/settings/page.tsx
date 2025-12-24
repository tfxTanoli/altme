
'use client';

import * as React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUser, useFirestore, updateDocumentNonBlocking, useAuth } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import type { User } from '@/lib/types';
import { Loader, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail } from 'firebase/auth';

const emailSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
});

const passwordSchema = z.object({
    newPassword: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
    confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});


export default function SettingsPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const auth = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    
    const [isSaving, setIsSaving] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [userData, setUserData] = React.useState<User | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);

    const [isReauthOpen, setIsReauthOpen] = React.useState(false);
    const [reauthPassword, setReauthPassword] = React.useState('');
    const [reauthAction, setReauthAction] = React.useState<'email' | 'password' | null>(null);
    const [isReauthing, setIsReauthing] = React.useState(false);
    
    const emailForm = useForm<z.infer<typeof emailSchema>>({
        resolver: zodResolver(emailSchema),
        defaultValues: { email: '' },
    });

    const passwordForm = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { newPassword: '', confirmPassword: '' },
    });

    React.useEffect(() => {
        if (!firestore || !user || !auth) {
            if (!isUserLoading) setIsLoading(false);
            return;
        };

        const fetchUserData = async () => {
            setIsLoading(true);
            try {
                const userDocRef = doc(firestore, 'users', user.uid);
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...docSnap.data() } as User;
                    setUserData(data);
                    if (data.role === 'admin') {
                        emailForm.setValue('email', auth.currentUser?.email || '');
                    } else {
                        emailForm.setValue('email', data.email);
                    }
                } else {
                    emailForm.setValue('email', auth.currentUser?.email || '');
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchUserData();
    }, [firestore, user, isUserLoading, emailForm, auth]);

    const handleReauthSubmit = async () => {
        if (!auth.currentUser || !reauthPassword || !reauthAction) return;

        setIsReauthing(true);
        try {
            const credential = EmailAuthProvider.credential(auth.currentUser.email!, reauthPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);

            setIsReauthOpen(false); // Close reauth dialog on success
            setReauthPassword('');   // Clear password

            if (reauthAction === 'email') {
                await handleChangeEmail(emailForm.getValues());
            } else if (reauthAction === 'password') {
                await handleChangePassword(passwordForm.getValues());
            }
            
            setReauthAction(null);

        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Authentication Failed',
                description: 'The password you entered is incorrect. Please try again.',
            });
        } finally {
            setIsReauthing(false);
        }
    };

    const handleChangeEmail = async (values: z.infer<typeof emailSchema>) => {
        if (!auth.currentUser || !firestore) return;
        setIsSaving(true);
        try {
            await verifyBeforeUpdateEmail(auth.currentUser, values.email);
            toast({ 
                title: 'Verification Email Sent', 
                description: `A verification link has been sent to ${values.email}. Please verify to complete the change. You will be logged out upon completion.` 
            });
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleChangePassword = async (values: z.infer<typeof passwordSchema>) => {
         if (!auth.currentUser) return;
        setIsSaving(true);
        try {
            await updatePassword(auth.currentUser, values.newPassword);
            toast({ title: 'Password Changed', description: 'Your password has been successfully updated.' });
            passwordForm.reset();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSaving(false);
        }
    }

    const onEmailSubmit = () => {
        setReauthAction('email');
        setIsReauthOpen(true);
    };

    const onPasswordSubmit = () => {
        setReauthAction('password');
        setIsReauthOpen(true);
    };

    const handleActivityStatusChange = async (checked: boolean) => {
        if (!user || !firestore) return;
        const userDocRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userDocRef, { showActivityStatus: checked });
        setUserData(prev => prev ? {...prev, showActivityStatus: checked} : null);
        toast({
            title: 'Settings Saved',
            description: 'Your activity status preference has been updated.',
        });
    };
    
    const handleDeleteAccount = async () => {
        if (!user || !firestore || !auth.currentUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not perform this action.' });
            return;
        }
        setIsDeleting(true);
        try {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, { status: 'deleted' });
            await auth.signOut();
            toast({ title: 'Account Disabled', description: 'Your account has been deactivated and you have been logged out.' });
            router.push('/');
        } catch(error: any) {
            console.error("Error deactivating account:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not deactivate your account.' });
        } finally {
            setIsDeleting(false);
        }
    };

    if (isLoading || isUserLoading) {
        return (
             <main className="flex flex-1 items-center justify-center">
                <Loader className="h-8 w-8 animate-spin" />
            </main>
        )
    }

    return (
        <>
            <Dialog open={isReauthOpen} onOpenChange={setIsReauthOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Re-authenticate</DialogTitle>
                        <DialogDescription>
                            For your security, please enter your current password to continue.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                         <div className="space-y-2">
                            <Label htmlFor="reauth-password">Current Password</Label>
                            <Input
                                id="reauth-password"
                                type="password"
                                value={reauthPassword}
                                onChange={(e) => setReauthPassword(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="secondary" disabled={isReauthing}>Cancel</Button></DialogClose>
                        <Button onClick={handleReauthSubmit} disabled={isReauthing}>
                             {isReauthing && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
                <div className="mx-auto grid w-full max-w-4xl gap-6">
                    <div className="flex items-center">
                        <h1 className="font-semibold text-lg md:text-2xl">Settings</h1>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Account Security</CardTitle>
                            <CardDescription>Manage your email address and password.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            <Form {...emailForm}>
                                <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                                     <FormField
                                        control={emailForm.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email Address</FormLabel>
                                                <FormControl>
                                                    <Input type="email" placeholder="Enter new email" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" disabled={isSaving}>
                                        {isSaving && reauthAction === 'email' && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                                        Change Email
                                    </Button>
                                </form>
                            </Form>
                             <Form {...passwordForm}>
                                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                                    <FormField
                                        control={passwordForm.control}
                                        name="newPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>New Password</FormLabel>
                                                <FormControl>
                                                    <Input type="password" placeholder="Enter new password" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                     <FormField
                                        control={passwordForm.control}
                                        name="confirmPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Confirm New Password</FormLabel>
                                                <FormControl>
                                                    <Input type="password" placeholder="Confirm new password" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" disabled={isSaving}>
                                        {isSaving && reauthAction === 'password' && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                                        Change Password
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>

                    {userData?.role !== 'admin' && (
                        <>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Privacy</CardTitle>
                                    <CardDescription>Control your privacy settings.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="activity-status" className="flex flex-col space-y-1">
                                            <span>Show my activity status</span>
                                            <span className="font-normal leading-snug text-muted-foreground">
                                                Allow others to see when you are currently online.
                                            </span>
                                        </Label>
                                        <Switch 
                                            id="activity-status" 
                                            checked={userData?.showActivityStatus ?? false}
                                            onCheckedChange={handleActivityStatusChange}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Delete Account</CardTitle>
                                    <CardDescription>Deactivate your account. You will be logged out and your profile will no longer be public.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" type="button">Deactivate My Account</Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action will deactivate your account. You will be logged out and your profile and listings will no longer be visible. 
                                                You can contact support to reactivate your account in the future.
                                            </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleDeleteAccount} disabled={isDeleting}>
                                                {isDeleting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                                                Deactivate
                                            </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            </main>
        </>
    );
}
