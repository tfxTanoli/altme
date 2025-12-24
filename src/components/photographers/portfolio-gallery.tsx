

'use client';

import * as React from 'react';
import Image from 'next/image';
import { Loader, Video, X, Trash2, Upload } from 'lucide-react';
import type { PortfolioItem } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '../ui/button';
import { useUser, useFirebase, useStorage } from '@/firebase';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface PortfolioGalleryProps {
  items: PortfolioItem[];
  setItems: React.Dispatch<React.SetStateAction<PortfolioItem[]>>;
  profileId: string;
  isOwnProfile: boolean;
  onUploadClick: () => void;
  isLoading: boolean;
}

export const PortfolioGallery: React.FC<PortfolioGalleryProps> = ({
  items,
  setItems,
  profileId,
  isOwnProfile,
  onUploadClick,
  isLoading,
}) => {
  const { toast } = useToast();
  const { user } = useUser();
  const { database } = useFirebase();
  const storage = useStorage();
  const [itemToDelete, setItemToDelete] = React.useState<PortfolioItem | null>(null);

  const handleDelete = async () => {
    if (!itemToDelete || !user || !database || !storage) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete item.' });
      return;
    };

    try {
      // Delete from Realtime Database
      const { ref, remove } = await import('firebase/database');
      const itemRef = ref(database, `photographerProfiles/${profileId}/portfolioItems/${itemToDelete.id}`);
      await remove(itemRef);

      // Delete from storage
      const mediaRef = storageRef(storage, itemToDelete.mediaUrl);
      await deleteObject(mediaRef);

      // Delete thumbnail if it exists
      if (itemToDelete.thumbnailUrl) {
        const thumbRef = storageRef(storage, itemToDelete.thumbnailUrl);
        await deleteObject(thumbRef);
      }

      setItems(prev => prev.filter(item => item.id !== itemToDelete.id));

      toast({ title: 'Item Deleted', description: 'The item has been removed from your portfolio.' });

    } catch (error) {
      console.error("Error deleting portfolio item:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete portfolio item.' });
    } finally {
      setItemToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center p-6">
          <Loader className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const canUploadMore = items.length < 10;

  return (
    <>
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the media from your portfolio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="group relative aspect-square">
              <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer">
                <Image
                  src={item.thumbnailUrl || item.mediaUrl}
                  alt={item.description || 'Portfolio Item'}
                  fill
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                  className="rounded-lg border object-cover transition-opacity group-hover:opacity-75"
                  data-ai-hint="portfolio image"
                />
              </a>
              {item.mediaType === 'video' && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/30">
                  <Video className="h-8 w-8 text-white" />
                </div>
              )}
              {isOwnProfile && (
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => setItemToDelete(item)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {isOwnProfile && canUploadMore && (
            <div
              onClick={onUploadClick}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/50 bg-muted/50 p-4 text-center transition-colors hover:border-primary hover:bg-muted"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="mt-2 text-sm font-medium text-muted-foreground">Add More</span>
            </div>
          )}
        </div>
      ) : isOwnProfile ? (
        <div
          onClick={onUploadClick}
          className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/50 p-12 text-center transition-colors hover:border-primary hover:bg-muted"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            Click to upload media
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <p>This photographer hasn't added any portfolio items yet.</p>
          </CardContent>
        </Card>
      )}
    </>
  );
};

