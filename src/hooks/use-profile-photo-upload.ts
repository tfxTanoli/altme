
import { useState, useRef } from 'react';
import { useAuth, useStorage, useUser, useFirebase } from '@/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { ref as databaseRef, update } from 'firebase/database';
import { useToast } from './use-toast';

export const useProfilePhotoUpload = () => {
    const { user } = useUser();
    const auth = useAuth();
    const storage = useStorage();
    const { database } = useFirebase();
    const { toast } = useToast();

    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) {
            return;
        }

        if (!auth || !database || !storage) {
            toast({
                variant: 'destructive',
                title: 'Service not available',
                description: 'Cannot connect to authentication, database, or storage service.',
            });
            return;
        }

        if (!user || !auth.currentUser) {
            toast({
                variant: 'destructive',
                title: 'Not authenticated',
                description: 'You must be logged in to upload a photo.',
            });
            return;
        }

        const file = event.target.files[0];
        setIsUploading(true);

        try {
            // 1. Upload file to Firebase Storage
            const fileRef = storageRef(storage, `profile-photos/${user.uid}/${file.name}`);
            const uploadResult = await uploadBytes(fileRef, file);

            // 2. Get download URL
            const downloadURL = await getDownloadURL(uploadResult.ref);

            // 3. Update Firebase Auth profile
            await updateProfile(auth.currentUser, { photoURL: downloadURL });

            // 4. Update user node in Realtime Database
            const userNodeRef = databaseRef(database, `users/${user.uid}`);
            await update(userNodeRef, { photoURL: downloadURL });

            toast({
                title: 'Photo updated!',
                description: 'Your new profile photo has been saved.',
            });

        } catch (error: any) {
            console.error('Error uploading profile photo:', error);
            toast({
                variant: 'destructive',
                title: 'Upload failed',
                description: error.message || 'There was a problem uploading your photo.',
            });
        } finally {
            setIsUploading(false);
            // Reset file input
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
