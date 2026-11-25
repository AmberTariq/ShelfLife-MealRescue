import { ProcessedImage } from '../types/kitchen';

const MAX_WIDTH = 1024;
const JPEG_QUALITY = 0.82;

export async function compressImageForTriage(file: File): Promise<ProcessedImage> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected image file.'));
      el.src = imageUrl;
    });

    const scale = img.naturalWidth > MAX_WIDTH ? MAX_WIDTH / img.naturalWidth : 1;
    const targetWidth = Math.max(1, Math.round(img.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas is unavailable for image compression.');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const previewUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = previewUrl.replace(/^data:image\/jpeg;base64,/, '');

    return {
      base64,
      mimeType: 'image/jpeg',
      previewUrl,
      width: targetWidth,
      height: targetHeight,
      fileName: file.name,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
