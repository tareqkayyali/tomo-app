/**
 * Firebase Storage Service
 * Handles uploading drill videos and profile photos
 */

import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as FileSystem from 'expo-file-system';
import app from './firebase';

const storage = getStorage(app);

/**
 * Upload a file to Firebase Storage
 * Returns the download URL
 */
async function uploadFile(
  storagePath: string,
  localUri: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  // Read file as blob
  const response = await fetch(localUri);
  const blob = await response.blob();

  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, blob);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.bytesTransferred / snapshot.totalBytes;
        onProgress?.(progress);
      },
      (error) => reject(error),
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(url);
      },
    );
  });
}

/**
 * Upload a drill session video
 */
export async function uploadDrillVideo(
  userId: string,
  drillId: string,
  videoUri: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const timestamp = Date.now();
  const path = `drills/${userId}/${drillId}_${timestamp}.mp4`;
  return uploadFile(path, videoUri, onProgress);
}

/**
 * Upload a profile photo
 */
export async function uploadProfilePhoto(
  userId: string,
  imageUri: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const path = `profiles/${userId}/avatar.jpg`;
  return uploadFile(path, imageUri, onProgress);
}

/**
 * Get file info (size in MB)
 */
export async function getFileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && 'size' in info) {
    return (info.size || 0) / (1024 * 1024);
  }
  return 0;
}
