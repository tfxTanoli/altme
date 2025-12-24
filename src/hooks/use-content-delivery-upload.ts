
'use client';

import { useState, useRef } from 'react';
import { useFirestore, useStorage, useUser } from '@/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, serverTimestamp, doc, writeBatch, arrayUnion } from 'firebase/firestore';
import { useToast } from './use-toast';
import type { ProjectRequest, ContentDelivery, ReferenceMedia } from '@/lib/types';
import { captureVideoFrame } from '@/lib/utils';
import { sendNotification } from '@/services/notifications';

export const useContentDeliveryUpload = (
    request: ProjectRequest | null,
    deliveries: ContentDelivery[],
    setDeliveries: React.Dispatch<React.SetStateAction<ContentDelivery[]>>
) => {
    const { user } = useUser();
    const storage = useStorage();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0 || !request) {
            return;
        }

        if (!user || !firestore || !storage) {
            toast({
                variant: 'destructive',
                title: 'Cannot upload media',
                description: 'Required services are not available.',
            });
            return;
        }

        setIsUploading(true);

        const requestId = request.id;
        let uploadSuccessCount = 0;

        try {
            const mediaToUpload: ReferenceMedia[] = [];

            for (const file of Array.from(files)) {
                try {
                    const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
                    const storageRef = ref(storage, `content-deliveries/${requestId}/${Date.now()}_${file.name}`);
                    const uploadResult = await uploadBytes(storageRef, file);
                    const downloadURL = await getDownloadURL(uploadResult.ref);

                    let thumbnailUrl: string | null = null;
                    if (mediaType === 'video') {
                        const thumbnailBlob = await captureVideoFrame(file, 'delivery');
                        if (thumbnailBlob) {
                            const thumbnailRef = ref(storage, `content-deliveries/${requestId}/thumbnails/${Date.now()}_${file.name}.jpg`);
                            const thumbnailUploadResult = await uploadBytes(thumbnailRef, thumbnailBlob);
                            thumbnailUrl = await getDownloadURL(thumbnailUploadResult.ref);
                        }
                    }

                    mediaToUpload.push({
                        url: downloadURL,
                        thumbnailUrl: thumbnailUrl,
                        type: mediaType,
                        name: file.name,
                    });
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

            if (mediaToUpload.length > 0) {
                const batch = writeBatch(firestore);
                const existingDelivery = deliveries.length > 0 ? deliveries[0] : null;

                if (existingDelivery) {
                    // Add to existing delivery
                    const deliveryDocRef = doc(firestore, 'requests', requestId, 'contentDeliveries', existingDelivery.id);
                    batch.update(deliveryDocRef, {
                        files: arrayUnion(...mediaToUpload)
                    });
                } else {
                    // Create new delivery
                    const deliveryDocRef = doc(collection(firestore, 'requests', requestId, 'contentDeliveries'));
                    const deliveryData: ContentDelivery = {
                        id: deliveryDocRef.id,
                        requestId: requestId,
                        files: mediaToUpload,
                        deliveryDate: serverTimestamp() as any,
                        isApproved: false
                    };
                    batch.set(deliveryDocRef, deliveryData);
                }

                // Update request status to 'Delivered' if it's 'In Progress'
                if (request.status === 'In Progress') {
                    const requestRef = doc(firestore, 'requests', requestId);
                    batch.update(requestRef, { status: 'Delivered' });
                }

                await batch.commit();

                await sendNotification(request.userId, {
                    title: 'Delivery Submitted',
                    message: `${uploadSuccessCount} file(s) have been delivered for "${request.title}".`,
                    type: 'delivery_submitted',
                    link: `/requests/${requestId}`,
                    relatedId: requestId
                });
            }

            if (uploadSuccessCount > 0) {
                toast({
                    title: 'Upload Complete!',
                    description: `${uploadSuccessCount} file(s) have been delivered.`,
                });
            }

        } catch (error: any) {
            console.error("Error committing delivery batch:", error);
            toast({
                variant: 'destructive',
                title: 'Delivery Failed',
                description: 'There was an issue saving the delivery information.',
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
