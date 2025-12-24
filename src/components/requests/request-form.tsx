

'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CalendarIcon, Loader, Upload, Video, X, Copyright } from 'lucide-react';
import { format, parse } from 'date-fns';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn, captureVideoFrame } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { countries } from '@/lib/countries';
import { useFirestore, useUser, addDocumentNonBlocking, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import type { ProjectRequest } from '@/lib/types';
import { useRequestMediaUpload } from '@/hooks/use-request-media-upload';

const MAX_REFERENCE_MEDIA = 10;

const formSchema = z.object({
  title: z.string().min(5, {
    message: 'Title must be at least 5 characters.',
  }),
  description: z.string().min(10, {
    message: 'Description must be at least 10 characters.',
  }),
  mediaTypes: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: 'You have to select at least one item.',
  }),
  videoDuration: z.string().optional(),
  country: z.string().optional(),
  location: z.string().optional(),
  datePreference: z.enum(['flexible', 'set-dates']).default('flexible'),
  dateType: z.enum(['specific-date', 'delivery-deadline']).optional(),
  dates: z.array(z.date()).optional(),
  budget: z.coerce.number().min(5, { message: "Budget must be at least $5." }).max(10000, { message: "Budget cannot exceed $10,000." }).optional(),
  copyrightOption: z.enum(['license', 'transfer']).default('license'),
});

type RequestFormProps = {
    request?: ProjectRequest;
    onSuccess?: () => void;
};

type Preview = {
    url: string;
    type: 'image' | 'video';
    name: string;
};

export function RequestForm({ request, onSuccess }: RequestFormProps) {
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [previews, setPreviews] = React.useState<Preview[]>([]);
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  
  const { uploadFiles, isUploading } = useRequestMediaUpload();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isEditMode = !!request;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: isEditMode ? {
        ...request,
        mediaTypes: request.mediaTypes || [],
        dates: request.dates ? request.dates.map(d => parse(d, 'PPP', new Date())) : undefined,
        copyrightOption: request.copyrightOption || 'license',
        datePreference: request.dates && request.dates.length > 0 ? 'set-dates' : 'flexible',
    } : {
      title: '',
      description: '',
      mediaTypes: [],
      videoDuration: '',
      country: '',
      location: '',
      budget: '' as any,
      datePreference: 'flexible',
      copyrightOption: 'license',
    },
  });
  
  const datePreference = form.watch('datePreference');
  const mediaTypes = form.watch('mediaTypes');

  React.useEffect(() => {
    // Populate previews if in edit mode and there's existing media
    if (isEditMode && request?.referenceMedia) {
      const existingPreviews = request.referenceMedia.map(media => ({
        url: media.thumbnailUrl || media.url,
        type: media.type,
        name: media.name,
      }));
      setPreviews(existingPreviews);
    }
    // Cleanup object URLs on unmount
    return () => {
      previews.forEach(preview => {
        // Only revoke if it's a blob URL created by the component
        if(preview.url.startsWith('blob:')) {
          URL.revokeObjectURL(preview.url);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, request?.referenceMedia]);


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        let files = Array.from(event.target.files);
        
        const currentCount = previews.length;
        const remainingSlots = MAX_REFERENCE_MEDIA - currentCount;

        if (remainingSlots <= 0) {
            toast({
                variant: 'destructive',
                title: 'Upload Limit Reached',
                description: `You can only upload a maximum of ${MAX_REFERENCE_MEDIA} files.`,
            });
            return;
        }

        if (files.length > remainingSlots) {
             toast({
                title: 'Upload Limit Exceeded',
                description: `You can only add ${remainingSlots} more file(s). The first ${remainingSlots} will be uploaded.`,
            });
            files = files.slice(0, remainingSlots);
        }

        setSelectedFiles(prev => [...prev, ...files]);

        const newPreviews = await Promise.all(files.map(async (file) => {
            const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
            let previewUrl = URL.createObjectURL(file);

            if (mediaType === 'video') {
                try {
                    const thumbBlob = await captureVideoFrame(file);
                    previewUrl = URL.createObjectURL(thumbBlob);
                } catch (error) {
                    console.error("Could not generate video thumbnail.", error);
                }
            }

            return {
                url: previewUrl,
                type: mediaType,
                name: file.name
            };
        }));

        setPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeFile = (index: number) => {
    const newPreviews = [...previews];
    const removedPreview = newPreviews.splice(index, 1)[0];
    if (removedPreview.url.startsWith('blob:')) {
      URL.revokeObjectURL(removedPreview.url);
    }
    setPreviews(newPreviews);
    
    // Find the corresponding file in selectedFiles and remove it
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    setSelectedFiles(newFiles);

    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }


  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !firestore) {
        toast({
            variant: 'destructive',
            title: 'Authentication Error',
            description: 'You must be logged in to perform this action.',
        });
        return;
    }

    setIsSubmitting(true);

    try {
        const filesToUpload = selectedFiles.filter((_, index) => previews[index]?.url.startsWith('blob:'));
        const referenceMediaUrls = await uploadFiles(filesToUpload);

        const processedValues: any = {
            ...values,
            dates: values.dates ? values.dates.map(date => format(date, 'PPP')) : [],
            budget: Number.isNaN(values.budget) ? 0 : values.budget || 0,
            dateType: values.dateType || null,
        };
        
        if (isEditMode) {
          const existingMedia = request.referenceMedia?.filter(media => previews.some(p => p.url === (media.thumbnailUrl || media.url) && !p.url.startsWith('blob:'))) || [];
          processedValues.referenceMedia = [...existingMedia, ...referenceMediaUrls];
        } else {
            processedValues.referenceMedia = referenceMediaUrls;
        }


        if (isEditMode) {
            const requestDocRef = doc(firestore, 'requests', request.id);
            const updateData = Object.fromEntries(
                Object.entries(processedValues).filter(([_, v]) => v !== undefined)
            );
            await updateDocumentNonBlocking(requestDocRef, updateData);
            toast({
                title: 'Request Updated!',
                description: 'Your changes have been saved.',
            });
        } else {
            const requestsColRef = collection(firestore, 'requests');
            const newRequestData = {
                ...processedValues,
                userId: user.uid,
                postedBy: user.displayName || user.email,
                status: 'Open' as const,
                createdAt: serverTimestamp(),
            };
            const newDocRef = await addDocumentNonBlocking(requestsColRef, newRequestData);
            await setDocumentNonBlocking(doc(requestsColRef, newDocRef.id), { id: newDocRef.id }, { merge: true });

             toast({
                title: 'Request Submitted!',
                description: 'Your photography request has been posted.',
            });
        }
        
        form.reset();
        setSelectedFiles([]);
        setPreviews([]);
        if (onSuccess) {
            onSuccess();
        } else if (!isEditMode) {
            router.push('/requests/browse');
        }

    } catch (error) {
        console.error("Error submitting request:", error);
        toast({
            variant: 'destructive',
            title: 'Something went wrong',
            description: 'There was an issue saving your request. Please try again.',
        });
    } finally {
        setIsSubmitting(false);
    }
  }
  
  const totalIsLoading = isUploading || isSubmitting;
  const canUploadMore = previews.length < MAX_REFERENCE_MEDIA;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Request Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Professional Headshots for Startup" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Description</FormLabel>
              </div>
              <FormControl>
                <Textarea
                  placeholder="Describe what you're looking for. Include details like the style, number of people, and desired outcomes."
                  className="min-h-[120px]"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                The more detail you provide, the better matches you'll get.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
            <FormLabel>Reference Media (optional)</FormLabel>
            <FormDescription className="pb-2">
                Add some images or videos to give photographers a better idea of what you're looking for. ({previews.length}/{MAX_REFERENCE_MEDIA})
            </FormDescription>
             <Input 
                id="file-upload"
                type="file" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
                accept="image/*,video/*"
                disabled={totalIsLoading || !canUploadMore}
            />
            {previews.length > 0 && (
                <div className="grid grid-cols-3 gap-4 mt-2 md:grid-cols-5">
                    {previews.map((preview, index) => (
                        <div key={index} className="relative group aspect-square">
                            <Image
                                src={preview.url}
                                alt={preview.name}
                                fill
                                className="object-cover rounded-md"
                            />
                            {preview.type === 'video' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                    <Video className="h-8 w-8 text-white" />
                                </div>
                            )}
                            <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => removeFile(index)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    {canUploadMore && (
                         <div 
                            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input p-4 text-center hover:border-primary/50 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="h-8 w-8 text-muted-foreground" />
                            <p className="mt-2 text-sm text-muted-foreground">Add More</p>
                        </div>
                    )}
                </div>
            )}
            
            {previews.length === 0 && canUploadMore && (
                <div 
                    className="mt-2 flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input p-12 text-center"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">Click to upload media</p>
                </div>
            )}
        </div>

        <div className="space-y-4">
             <FormField
                control={form.control}
                name="mediaTypes"
                render={() => (
                    <FormItem>
                    <div className="mb-4">
                        <FormLabel>Media Type</FormLabel>
                        <FormDescription>
                        What type of media are you looking for?
                        </FormDescription>
                    </div>
                    <div className="flex gap-4">
                    {['image', 'video'].map((item) => (
                        <FormField
                        key={item}
                        control={form.control}
                        name="mediaTypes"
                        render={({ field }) => {
                            return (
                            <FormItem
                                key={item}
                                className="flex flex-row items-start space-x-3 space-y-0"
                            >
                                <FormControl>
                                <Checkbox
                                    checked={field.value?.includes(item)}
                                    onCheckedChange={(checked) => {
                                    return checked
                                        ? field.onChange([...(field.value || []), item])
                                        : field.onChange(
                                            field.value?.filter(
                                                (value) => value !== item
                                            )
                                        )
                                    }}
                                />
                                </FormControl>
                                <FormLabel className="font-normal capitalize">
                                    {item}
                                </FormLabel>
                            </FormItem>
                            )
                        }}
                        />
                    ))}
                    </div>
                    <FormMessage />
                    </FormItem>
                )}
                />
            {mediaTypes?.includes('video') && (
                <FormField
                    control={form.control}
                    name="videoDuration"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Video Duration</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select an approximate video length" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="< 1 minute">&lt; 1 minute</SelectItem>
                                <SelectItem value="1-3 minutes">1-3 minutes</SelectItem>
                                <SelectItem value="3-5 minutes">3-5 minutes</SelectItem>
                                <SelectItem value="5+ minutes">5+ minutes</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
            )}
        </div>


        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <FormField
              control={form.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a country" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        {countries.map((country) => (
                            <SelectItem key={country.value} value={country.value}>
                            {country.label}
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City / Area</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Brooklyn, NY" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>
        <div className='grid grid-cols-1 gap-8 md:grid-cols-2'>
             <div className="space-y-4">
                <FormField
                    control={form.control}
                    name="datePreference"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                        <FormLabel>Date Preference</FormLabel>
                        <FormControl>
                            <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex space-x-4"
                            >
                            <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                <RadioGroupItem value="flexible" />
                                </FormControl>
                                <FormLabel className="font-normal">Flexible / No deadline</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                <RadioGroupItem value="set-dates" />
                                </FormControl>
                                <FormLabel className="font-normal">Set Dates</FormLabel>
                            </FormItem>
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                
                {datePreference === 'set-dates' && (
                    <div className="pl-2 space-y-4">
                        <FormField
                            control={form.control}
                            name="dateType"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormLabel>Date Type</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    className="flex space-x-4"
                                    >
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                        <FormControl>
                                        <RadioGroupItem value="specific-date" />
                                        </FormControl>
                                        <FormLabel className="font-normal">Specific Date</FormLabel>
                                    </FormItem>
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                        <FormControl>
                                        <RadioGroupItem value="delivery-deadline" />
                                        </FormControl>
                                        <FormLabel className="font-normal">Delivery Deadline</FormLabel>
                                    </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="dates"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                <Popover>
                                    <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                        variant={'outline'}
                                        className={cn(
                                            'pl-3 text-left font-normal',
                                            !field.value?.length && 'text-muted-foreground'
                                        )}
                                        >
                                        {field.value && field.value.length > 0 ? (
                                            field.value.length > 1 ? `${field.value.length} dates selected` : format(field.value[0], 'PPP')
                                        ) : (
                                            <span>Pick a date</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="multiple"
                                        selected={field.value}
                                        onSelect={field.onChange}
                                        disabled={(date) =>
                                        date < new Date() || date < new Date('1900-01-01')
                                        }
                                        initialFocus
                                    />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                    </div>
                )}
            </div>
             <FormField
              control={form.control}
              name="budget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget ($)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 500" {...field} onChange={event => field.onChange(+event.target.value)} value={field.value === 0 ? '' : field.value} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>
        
        <FormField
          control={form.control}
          name="copyrightOption"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Copyright & Usage Rights</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex flex-col space-y-2"
                >
                  <FormItem className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <RadioGroupItem value="license" />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Grant of License
                      </FormLabel>
                      <FormDescription>
                        The photographer retains copyright, but you get a license to use the images for your specified purposes (e.g., personal use, social media, marketing).
                      </FormDescription>
                    </div>
                  </FormItem>
                  <FormItem className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <RadioGroupItem value="transfer" />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Transfer of Copyright
                      </FormLabel>
                      <FormDescription>
                        You acquire full ownership and copyright of the images. This is typically more expensive as the photographer gives up all rights.
                      </FormDescription>
                    </div>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-center">
            <Button type="submit" size="lg" disabled={totalIsLoading}>
                {totalIsLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? 'Save Changes' : 'Post Request'}
            </Button>
        </div>
      </form>
    </Form>
  );
}

    
