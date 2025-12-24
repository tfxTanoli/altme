

'use client';

import { useState } from 'react';
import { useStorage, useUser } from '@/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useToast } from './use-toast';
import type { ReferenceMedia } from '@/lib/types';
import { captureVideoFrame } from '@/lib/utils';

export const useRequestMediaUpload = () => {
    const { user } = useUser();
    const storage = useStorage();
    const { toast } = useToast();

    const [isUploading, setIsUploading] = useState(false);

    const uploadFiles = async (files: File[]): Promise<ReferenceMedia[]> => {
        if (files.length === 0) {
            return [];
        }

        if (!user || !storage) {
            toast({ variant: 'destructive', title: 'Error', description: 'User or Firebase Storage not available.' });
            return [];
        }

        setIsUploading(true);

        try {
            const uploadPromises = files.map(async (file) => {
                const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
                const storageRef = ref(storage, `request-media/${user.uid}/${Date.now()}_${file.name}`);
                
                const uploadResult = await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(uploadResult.ref);

                let thumbnailUrl: string | null = null;
                if (mediaType === 'video') {
                    const thumbnailBlob = await captureVideoFrame(file, 'request');
                    if (thumbnailBlob) {
                        const thumbnailRef = ref(storage, `request-media/${user.uid}/thumbnails/${Date.now()}_${file.name}.jpg`);
                        const thumbnailUploadResult = await uploadBytes(thumbnailRef, thumbnailBlob);
                        thumbnailUrl = await getDownloadURL(thumbnailUploadResult.ref);
                    }
                }

                return {
                    url: downloadURL,
                    thumbnailUrl,
                    type: mediaType,
                    name: file.name,
                } as ReferenceMedia;
            });

            const uploadedMedia = await Promise.all(uploadPromises);
            return uploadedMedia;
            
        } catch (error: any) {
            console.error("Request media upload failed:", error);
            toast({
                variant: 'destructive',
                title: 'Upload Failed',
                description: error.message || 'There was a problem uploading your files.',
            });
            return []; // Return empty array on failure
        } finally {
            setIsUploading(false);
        }
    };

    return {
        isUploading,
        uploadFiles,
    };
};
