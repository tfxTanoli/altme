
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { addDocumentNonBlocking, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, serverTimestamp } from 'firebase/firestore';
import { useState } from 'react';
import { Loader } from 'lucide-react';
import type { User } from '@/lib/types';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  message: z.string().min(10, { message: 'Message must be at least 10 characters.' }),
});

export default function ContactPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      message: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Could not connect to the database. Please try again later.',
        });
        return;
    }
    setIsLoading(true);
    try {
        // 1. Save the submission to the contactSubmissions collection.
        const submissionData = {
            ...values,
            submittedAt: serverTimestamp(),
        };
        const submissionRef = await addDocumentNonBlocking(collection(firestore, 'contactSubmissions'), submissionData);

        if (submissionRef) {
            // 2. After submission is saved, trigger the email.
            const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
            if (adminEmail) {
                const emailContent = `
                    <p><strong>Name:</strong> ${values.name}</p>
                    <p><strong>Email:</strong> ${values.email}</p>
                    <p><strong>Message:</strong></p>
                    <p>${values.message}</p>
                `;
                const mailData = {
                    to: [adminEmail],
                    message: {
                        subject: `New Contact Form Submission from ${values.name}`,
                        html: emailContent,
                    },
                };
                // This call is non-blocking and will queue the email.
                addDocumentNonBlocking(collection(firestore, 'mail'), mailData);
            }
            
            toast({
                title: 'Message Sent!',
                description: "Thanks for reaching out. We'll get back to you soon.",
            });
            form.reset();

        } else {
            // This would happen if addDocumentNonBlocking failed, e.g., due to permissions.
            throw new Error("Failed to save contact submission.");
        }

    } catch (error) {
        console.error("Error submitting contact form:", error);
        toast({
            variant: 'destructive',
            title: 'Something went wrong',
            description: 'There was an issue sending your message. Please try again.',
        });
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="mx-auto grid w-full max-w-2xl items-start gap-6">
        <div className="flex items-center">
            <h1 className="font-semibold text-lg md:text-2xl">Contact Us</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Get in Touch</CardTitle>
            <CardDescription>
              Have a question or feedback? Fill out the form below and we'll get back to you as soon as possible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your name" {...field} />
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
                        <Input type="email" placeholder="Enter your email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea id="message" placeholder="Enter your message" className="min-h-[120px]" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : 'Send Message'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
