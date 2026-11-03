import imageCompression from 'browser-image-compression';

export async function prepareUploadImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return imageCompression(file, {
    maxSizeMB: 3,
    maxWidthOrHeight: 2560,
    initialQuality: 0.86,
    useWebWorker: true,
    preserveExif: true,
  });
}

export async function prepareOfflinePreview(blob: Blob, filename = 'preview.jpg'): Promise<Blob> {
  if (!blob.type.startsWith('image/')) return blob;
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  return imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1600, initialQuality: 0.8, useWebWorker: true });
}
