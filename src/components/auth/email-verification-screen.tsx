
'use client';

import React from 'react';
import { useAuth, useUser } from '@/firebase';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader, MailCheck, LogOut, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export const EmailVerificationScreen = () => {
    const { user } = useUser();
    const auth = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [isSending, setIsSending] = React.useState(false);

    const handleResendEmail = async () => {
        if (!user) return;
        setIsSending(true);
        try {
            await sendEmailVerification(user);
            toast({
                title: 'Verification Email Sent',
                description: 'Please check your inbox (and spam folder) for the verification link.',
            });
        } catch (error: any) {
            console.error("Error resending verification email:", error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.code === 'auth/too-many-requests' 
                    ? 'Too many requests. Please try again later.' 
                    : 'Could not send verification email. Please try again.',
            });
        } finally {
            setIsSending(false);
        }
    };
    
    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/');
        } catch (error) {
            console.error("Error signing out:", error);
            toast({ variant: 'destructive', title: 'Logout Failed' });
        }
    }

    const handleReload = () => {
        window.location.reload();
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <MailCheck className="h-8 w-8" />
                    </div>
                    <CardTitle className="text-2xl">Verify Your Email</CardTitle>
                    <CardDescription>
                        We've sent a verification link to <strong>{user?.email}</strong>. Please check your inbox and click the link to continue.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-center text-sm text-muted-foreground">
                        <p>After verifying, click reload to continue.</p>
                    </div>
                    <div className="flex flex-col items-center gap-4">
                        <Button onClick={handleReload} className="w-full">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Reload
                        </Button>
                        <Button onClick={handleResendEmail} disabled={isSending} className="w-full" variant="secondary">
                            {isSending && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                            Resend Verification Email
                        </Button>
                         <Button variant="outline" onClick={handleLogout} className="w-full">
                           <LogOut className="mr-2 h-4 w-4" />
                            Logout
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
