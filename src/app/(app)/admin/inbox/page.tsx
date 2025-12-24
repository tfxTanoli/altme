
'use client';

import { useFirestore, errorEmitter, FirestorePermissionError, useUser, updateDocumentNonBlocking } from '@/firebase';
import { collection, getDocs, orderBy, query, doc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader } from 'lucide-react';
import { format } from 'date-fns';
import React, { useState, useEffect } from 'react';

type ContactSubmission = {
  id: string;
  name: string;
  email: string;
  message: string;
  submittedAt: {
    seconds: number;
    nanoseconds: number;
  };
};

export default function InboxPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const [submissions, setSubmissions] = useState<ContactSubmission[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore) return;

    const fetchSubmissions = async () => {
        setIsLoading(true);
        try {
            const submissionsRef = collection(firestore, 'contactSubmissions');
            const q = query(submissionsRef, orderBy('submittedAt', 'desc'));
            const snapshot = await getDocs(q).catch(err => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'contactSubmissions', operation: 'list'}));
                throw err;
            });
            const submissionData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactSubmission));
            setSubmissions(submissionData);

            // Reset notification count for admin
            if (user) {
              const userDocRef = doc(firestore, 'users', user.uid);
              updateDocumentNonBlocking(userDocRef, { unreadContactSubmissionsCount: 0 });
            }

        } catch (error) {
            console.error("Error fetching contact submissions:", error);
            setSubmissions([]);
        } finally {
            setIsLoading(false);
        }
    }

    fetchSubmissions();
  }, [firestore, user]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-semibold text-lg md:text-2xl">Inbox</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact Form Submissions</CardTitle>
          <CardDescription>
            Messages sent from the "Contact Us" page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="flex justify-center items-center h-40">
                <Loader className="h-8 w-8 animate-spin" />
             </div>
          ) : submissions && submissions.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {submissions.map((submission) => (
                <AccordionItem value={submission.id} key={submission.id}>
                  <AccordionTrigger>
                    <div className="flex justify-between w-full pr-4">
                        <div className="flex flex-col text-left">
                            <span className="font-medium">{submission.name}</span>
                            <span className="text-sm text-muted-foreground">{submission.email}</span>
                        </div>
                         <div className="text-sm text-muted-foreground">
                            {submission.submittedAt?.seconds ? format(new Date(submission.submittedAt.seconds * 1000), 'PPP p') : 'N/A'}
                        </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="whitespace-pre-wrap">{submission.message}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>There are no messages in the inbox.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
