

'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUser, useFirestore, addDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useReportMediaUpload } from '@/hooks/use-report-media-upload';
import { collection, serverTimestamp, doc, writeBatch } from 'firebase/firestore';
import { Loader, Upload, Paperclip, X, Flag, Video } from 'lucide-react';
import type { ReferenceMedia } from '@/lib/types';
import { Form, FormDescription, FormField, FormItem, FormMessage } from './ui/form';
import { cn } from '@/lib/utils';


const reportSchema = z.object({
  reason: z.string({ required_error: 'Please select a reason.' }),
  details: z.string().min(10, { message: 'Please provide at least 10 characters of detail.' }),
});

type ReportFormValues = z.infer<typeof reportSchema>;

interface ReportDialogProps {
  reportedUserId: string;
  context: {
    type: 'user' | 'request';
    id: string;
  };
  isDispute?: boolean;
}

export function ReportDialog({ reportedUserId, context, isDispute = false }: ReportDialogProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [previews, setPreviews] = React.useState<{url: string, type: 'image' | 'video'}[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { uploadFiles, isUploading } = useReportMediaUpload();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);


  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
        reason: '',
        details: '',
    }
  });

    const resetForm = () => {
        form.reset();
        setSelectedFiles([]);
        setPreviews([]);
    };


  const onSubmit = async (data: ReportFormValues) => {
    if (!user || !firestore) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to submit a report.' });
      return;
    }
    setIsSubmitting(true);
    
    try {
      const mediaAttachments = await uploadFiles(selectedFiles);

      const reportData = {
          reporterId: user.uid,
          reportedUserId,
          reason: data.reason,
          details: data.details || '',
          context,
          mediaAttachments,
          status: 'open' as const,
          createdAt: serverTimestamp(),
      };
      
      const batch = writeBatch(firestore);
      
      const reportRef = doc(collection(firestore, 'reports'));
      batch.set(reportRef, {...reportData, id: reportRef.id});
      
      // If it's a dispute, update the request status
      if (isDispute && context.type === 'request') {
        const requestRef = doc(firestore, 'requests', context.id);
        batch.update(requestRef, { status: 'Disputed' });
      }

      await batch.commit();
      
      toast({
          title: isDispute ? 'Dispute Raised' : 'Report Submitted',
          description: 'Thank you for your feedback. Our team will review it shortly.',
      });
      
      setIsOpen(false);
      resetForm();

    } catch (error: any) {
        console.error('Error submitting report:', error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to submit report. Please try again.',
        });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        const files = Array.from(event.target.files);
        setSelectedFiles(prev => [...prev, ...files]);

        const newPreviews = files.map(file => ({
            url: URL.createObjectURL(file),
            type: file.type.startsWith('image/') ? 'image' : 'video'
        }));
        setPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeFile = (index: number) => {
    const newSelectedFiles = [...selectedFiles];
    newSelectedFiles.splice(index, 1);
    setSelectedFiles(newSelectedFiles);

    const newPreviews = [...previews];
    const removedPreview = newPreviews.splice(index, 1)[0];
    URL.revokeObjectURL(removedPreview.url);
    setPreviews(newPreviews);
  };
  
  React.useEffect(() => {
    return () => previews.forEach(p => URL.revokeObjectURL(p.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalIsLoading = isUploading || isSubmitting;
  
  const triggerText = isDispute 
    ? 'Raise a Dispute' 
    : context.type === 'user' 
    ? 'Report this user' 
    : 'Report this project';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if(!open) resetForm();}}>
        <DialogTrigger asChild>
             <Button variant="ghost" className={cn("justify-center px-4 text-sm font-normal text-destructive hover:text-destructive")}>
                <Flag className="mr-2 h-4 w-4" /> 
                {triggerText}
            </Button>
        </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isDispute ? 'Raise a Dispute' : 'Submit a Report'}</DialogTitle>
          <DialogDescription>
             {isDispute 
                ? "If you're having an issue with this project, please provide details below. An admin will review the situation."
                : "Help us keep the community safe. Please provide details about why you are reporting this."
             }
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                        <FormItem>
                            <Label>Reason</Label>
                            <RadioGroup onValueChange={field.onChange} value={field.value} className="space-y-2 pt-2">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="spam" id="spam" />
                                    <Label htmlFor="spam">Spam or Scam</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="inappropriate" id="inappropriate" />
                                    <Label htmlFor="inappropriate">Inappropriate Content</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="harassment" id="harassment" />
                                    <Label htmlFor="harassment">Harassment</Label>
                                </div>
                                 {isDispute && (
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="delivery_issue" id="delivery_issue" />
                                        <Label htmlFor="delivery_issue">Delivery Issue</Label>
                                    </div>
                                 )}
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="other" id="other" />
                                    <Label htmlFor="other">Other</Label>
                                </div>
                            </RadioGroup>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                
                <FormField
                    control={form.control}
                    name="details"
                    render={({ field }) => (
                         <FormItem>
                            <Label htmlFor="details">Details</Label>
                            <textarea
                                id="details"
                                placeholder="Please provide specific details about the issue..."
                                className={cn(
                                    'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                                    form.formState.errors.details && "border-destructive"
                                )}
                                {...field}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />

                 <div className="space-y-2">
                    <Label htmlFor="file-upload">Attach Media (optional)</Label>
                    <FormDescription>Attach screenshots or video evidence.</FormDescription>
                    <Input
                        id="file-upload"
                        type="file"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        multiple
                        accept="image/*,video/*"
                        disabled={totalIsLoading}
                    />
                    {previews.length > 0 ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                            {previews.map((preview, index) => (
                                <div key={index} className="relative group">
                                    <div className="w-full h-32 rounded-md overflow-hidden relative">
                                        <Image
                                            src={preview.url}
                                            alt={`Preview ${index + 1}`}
                                            fill
                                            className="object-cover"
                                        />
                                        {preview.type === 'video' && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                <Video className="h-8 w-8 text-white"/>
                                            </div>
                                        )}
                                    </div>
                                <Button
                                    size="icon"
                                    variant="destructive"
                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => removeFile(index)}
                                    type="button"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                                </div>
                            ))}
                            </div>
                            <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={totalIsLoading}>
                                <Upload className="mr-2 h-4 w-4" />
                                Add more files
                            </Button>
                        </div>
                    ) : (
                        <div 
                            className="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input p-12 text-center hover:border-primary/50 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="h-8 w-8 text-muted-foreground" />
                            <p className="mt-2 font-medium">Click to upload files</p>
                            <p className="text-sm text-muted-foreground">or drag and drop</p>
                        </div>
                    )}
                </div>


                <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={totalIsLoading}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={totalIsLoading}>
                        {(isSubmitting || isUploading) && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                        Submit Report
                    </Button>
                </DialogFooter>
            </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
