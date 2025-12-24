import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { PlaceHolderImages } from "./placeholder-images";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getImageUrl(id?: string) {
  if (!id) return 'https://placehold.co/400x400';
  const image = PlaceHolderImages.find((img) => img.id === id);
  return image ? image.imageUrl : 'https://placehold.co/400x400';
}

/**
 * Captures the first frame of a video file and returns it as a Blob. Includes a timeout.
 * @param file The video file.
 * @param context A string to differentiate callers, helping prevent race conditions.
 * @param timeoutMs The timeout in milliseconds. Defaults to 5000ms.
 * @returns A promise that resolves with a Blob of the first frame.
 */
export function captureVideoFrame(file: File, context: string, timeoutMs: number = 5000): Promise<Blob | null> {
  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout | null = null;
    const video = document.createElement('video');
    let videoUrl: string | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      video.remove();
    };

    timeoutId = setTimeout(() => {
      console.warn(`Video frame capture for ${context} timed out after ${timeoutMs}ms.`);
      cleanup();
      resolve(null); // Resolve with null on timeout
    }, timeoutMs);

    const handleSeeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas context.');
        cleanup();
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        cleanup();
        if (blob) {
          resolve(blob);
        } else {
          console.warn(`Canvas to Blob conversion failed for ${context}.`);
          resolve(null);
        }
      }, 'image/jpeg');
    };

    const handleLoadedData = () => {
      video.currentTime = 0.1; // Seek to a very early frame
    };
    
    const handleError = () => {
      console.error(`Video loading error for ${context}. The video file may be corrupt or in an unsupported format.`);
      cleanup();
      resolve(null); // Resolve with null on error
    };

    video.addEventListener('loadeddata', handleLoadedData, { once: true });
    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;
    video.load(); // Explicitly call load
  });
}
