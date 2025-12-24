
'use client';

import { useState, useRef } from 'react';
import { useStorage, useUser, useFirebase } from '@/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ref as databaseRef, push, serverTimestamp, set } from 'firebase/database';
import { useToast } from './use-toast';
import type { PhotographerProfile, PortfolioItem } from '@/lib/types';
import { captureVideoFrame } from '@/lib/utils';

const MAX_PORTFOLIO_ITEMS = 10;

export const usePortfolioMediaUpload = (
    profile: PhotographerProfile | null | undefined,
    setPortfolioItems: React.Dispatch<React.SetStateAction<PortfolioItem[]>>
) => {
    const { user } = useUser();
    const storage = useStorage();
    const { database } = useFirebase();
    const { toast } = useToast();

    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        let files = event.target.files;
        if (!files || files.length === 0 || !profile) {
            return;
        }

        if (!user || !database || !storage) {
            toast({
                variant: 'destructive',
                title: 'Cannot upload media',
                description: 'Required services are not available.',
            });
            return;
        }

        const currentItemCount = profile.portfolioItemIds?.length || 0;
        const remainingSlots = MAX_PORTFOLIO_ITEMS - currentItemCount;

        if (remainingSlots <= 0) {
            toast({
                variant: 'destructive',
                title: 'Portfolio Limit Reached',
                description: `You can only have a maximum of ${MAX_PORTFOLIO_ITEMS} items.`,
            });
            return;
        }

        if (files.length > remainingSlots) {
            toast({
                title: 'Upload Limit Exceeded',
                description: `You can only add ${remainingSlots} more item(s). The first ${remainingSlots} files will be uploaded.`,
            });
        }

        const filesToUpload = Array.from(files).slice(0, remainingSlots);

        setIsUploading(true);

        let uploadSuccessCount = 0;

        try {
            for (const file of filesToUpload) {
                try {
                    const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
                    const fileRef = storageRef(storage, `portfolio-media/${user.uid}/${Date.now()}_${file.name}`);

                    const uploadResult = await uploadBytes(fileRef, file);
                    const downloadURL = await getDownloadURL(uploadResult.ref);

                    let thumbnailUrl: string | null = null;
                    if (mediaType === 'video') {
                        const thumbnailBlob = await captureVideoFrame(file, 'portfolio');
                        if (thumbnailBlob) {
                            const thumbnailRef = storageRef(storage, `portfolio-media/${user.uid}/thumbnails/${Date.now()}_${file.name}.jpg`);
                            const thumbnailUploadResult = await uploadBytes(thumbnailRef, thumbnailBlob);
                            thumbnailUrl = await getDownloadURL(thumbnailUploadResult.ref);
                        }
                    }

                    // Push new item to Realtime Database
                    const itemsRef = databaseRef(database, `photographerProfiles/${profile.id}/portfolioItems`);
                    const newItemRef = push(itemsRef);
                    const newItemData: PortfolioItem = {
                        id: newItemRef.key as string,
                        photographerProfileId: profile.id,
                        userId: user.uid,
                        mediaUrl: downloadURL,
                        mediaType,
                        description: '',
                        createdAt: serverTimestamp() as any,
                    };

                    if (thumbnailUrl) {
                        newItemData.thumbnailUrl = thumbnailUrl;
                    }

                    await set(newItemRef, newItemData);
                    uploadSuccessCount++;

                } catch (uploadError) {
                    console.error(`Error uploading file ${file.name}:`, uploadError);
                    toast({
                        variant: 'destructive',
                        title: `Upload failed for ${file.name}`,
                        description: 'Please try again.',
                    });
                }
            }

            if (uploadSuccessCount > 0) {
                toast({
                    title: 'Upload Complete!',
                    description: `${uploadSuccessCount} item(s) have been added to your portfolio.`,
                });
            }

        } catch (error: any) {
            console.error("Error committing portfolio items:", error);
            toast({
                variant: 'destructive',
                title: 'Upload Failed',
                description: 'There was an issue saving your portfolio items.',
            });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    return {
        isUploading,
        fileInputRef,
        handleFileChange,
        triggerFileInput,
    };
};
