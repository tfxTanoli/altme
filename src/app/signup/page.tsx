
'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { useState } from 'react';
import { Loader } from 'lucide-react';
import { Logo } from '@/components/logo';

const formSchema = z.object({
  name: z
    .string()
    .min(3, { message: 'Username must be at least 3 characters.' })
    .max(20, { message: 'Username must not be longer than 20 characters.' })
    .regex(/^[a-zA-Z0-9_.]+$/, {
      message: 'Username can only contain letters, numbers, underscores, and periods.',
    }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  terms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions.',
  }),
});

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuth();

  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      terms: false,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    if (!auth) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Auth service not available.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );

      const user = userCredential.user;

      await updateProfile(user, { displayName: values.name });

      // Send verification email
      await sendEmailVerification(user);

      // We'll use getDatabase() here directly or assume it's available via context if we used the hook
      // But since we are inside a component, let's use the hook we created or get it from context
      // Note: We need to import useDatabase at the top, I'll add that in a separate replacement or assume it's done.
      // For now, I'll use the import from firebase/database directly inside this function if needed, 
      // but better to rely on value from useDatabase hook.
      // Let's assume `database` is available.

      // Since I can't easily add the hook call at the top level in this single replacement without replacing the whole file,
      // I'll assume the user will fix the hook call or I'll do it in a second pass. 
      // ACTUALLY, I should replace the whole file content related to firestore with database.

      // Re-fetching database instance here to be safe if hook isn't set up yet in the component body
      const { getDatabase, ref, update, serverTimestamp } = await import('firebase/database');
      const { getApp } = await import('firebase/app');
      const db = getDatabase(getApp());

      const updates: any = {};

      // User data
      const userData = {
        id: user.uid,
        email: user.email,
        name: values.name,
        role: 'user',
        status: 'active',
        joinDate: serverTimestamp(),
        showActivityStatus: true,
      };
      updates[`/users/${user.uid}`] = userData;

      // Photographer Profile data
      // For RTDB, we can just use the user.uid as the key for simplicity and 1:1 mapping, 
      // or generate a push ID if we really want a separate ID. 
      // Firestore logic generated a new ID. Let's stick to 1:1 for profile to user if possible, 
      // but the original code separated them. Let's generate a push ID for the profile.
      // actually, let's use a push ID for the profile to match the "random ID" behavior
      const { push } = await import('firebase/database');
      const profileRef = push(ref(db, 'photographerProfiles'));
      const profileId = profileRef.key;

      const profileData = {
        id: profileId,
        userId: user.uid,
        isAcceptingRequests: true,
        bio: '',
        areas: [],
        serviceCountry: '',
      };
      updates[`/photographerProfiles/${profileId}`] = profileData;

      await update(ref(db), updates);

      toast({
        title: 'Account Created & Verification Email Sent',
        description: "Welcome to AltMe! Please check your inbox to verify your email.",
      });

      router.push('/requests');
    } catch (error: any) {
      let errorMessage = 'An unknown error occurred.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email address is already in use.';
      } else {
        console.error('Signup Error:', error);
        errorMessage = error.message;
      }
      toast({
        variant: 'destructive',
        title: 'Signup Failed',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-muted/40 pt-12 md:pt-20">
      <div className="flex flex-col items-center gap-8">
        <Link href="/">
          <Logo />
        </Link>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Sign Up</CardTitle>
            <CardDescription>
              Create an account to get started with AltMe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Your username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="m@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="terms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          I agree to the
                          <Link href="/terms-of-service" className="underline hover:text-primary"> Terms of Service </Link>
                          and
                          <Link href="/privacy" className="underline hover:text-primary"> Privacy Policy</Link>.
                        </FormLabel>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
              </form>
            </Form>
            <div className="mt-4 text-center text-sm">
              Already have an account?{' '}
              <Link href="/login" className="underline">
                Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
