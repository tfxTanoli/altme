
'use client';

import { useState } from 'react';
import { useStorage, useUser } from '@/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useToast } from './use-toast';
import type { ReferenceMedia } from '@/lib/types';

export const useReportMediaUpload = () => {
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
                const storageRef = ref(storage, `report-media/${user.uid}/${Date.now()}_${file.name}`);
                
                const uploadResult = await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(uploadResult.ref);

                return {
                    url: downloadURL,
                    type: mediaType,
                    name: file.name,
                } as ReferenceMedia;
            });

            const uploadedMedia = await Promise.all(uploadPromises);
            return uploadedMedia;
            
        } catch (error: any) {
            console.error("Report media upload failed:", error);
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
