import type { CropRect } from '@/types';

export interface PreparedImage {
  file: File;
  originalUrl: string;
  analysisUrl: string;
  analysisBlob: Blob;
  imageData: ImageData;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  crop: CropRect;
  wasScaled: boolean;
}

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_DIMENSION = 1800;

export function validateImageFile(file: File): string | null {
  if (!SUPPORTED_TYPES.includes(file.type.toLowerCase())) {
    return 'Unsupported file type. Use PNG, JPG, JPEG or WebP.';
  }
  if (file.size > 45 * 1024 * 1024) {
    return 'This image is larger than 45 MB. Please crop or compress it before uploading.';
  }
  return null;
}

export async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The image could not be decoded.'));
    });
    return image;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function clampCrop(crop: CropRect): CropRect {
  const width = Math.max(0.02, Math.min(1, crop.width));
  const height = Math.max(0.02, Math.min(1, crop.height));
  return {
    x: Math.max(0, Math.min(1 - width, crop.x)),
    y: Math.max(0, Math.min(1 - height, crop.y)),
    width,
    height,
  };
}

export async function prepareImage(
  file: File,
  cropInput: CropRect = { x: 0, y: 0, width: 1, height: 1 },
): Promise<PreparedImage> {
  const error = validateImageFile(file);
  if (error) throw new Error(error);
  const image = await loadImageElement(file);
  const originalWidth = image.naturalWidth;
  const originalHeight = image.naturalHeight;
  if (!originalWidth || !originalHeight) {
    URL.revokeObjectURL(image.src);
    throw new Error('The image has no readable dimensions.');
  }
  const crop = clampCrop(cropInput);
  const cropX = Math.round(crop.x * originalWidth);
  const cropY = Math.round(crop.y * originalHeight);
  const cropWidth = Math.max(1, Math.round(crop.width * originalWidth));
  const cropHeight = Math.max(1, Math.round(crop.height * originalHeight));
  const scale = Math.min(1, MAX_DIMENSION / Math.max(cropWidth, cropHeight));
  const width = Math.max(1, Math.round(cropWidth * scale));
  const height = Math.max(1, Math.round(cropHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    URL.revokeObjectURL(image.src);
    throw new Error('Canvas rendering is not available in this browser.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    width,
    height,
  );
  const imageData = context.getImageData(0, 0, width, height);
  const analysisBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      'image/png',
    );
  });
  const analysisUrl = URL.createObjectURL(analysisBlob);
  return {
    file,
    originalUrl: image.src,
    analysisUrl,
    analysisBlob,
    imageData,
    width,
    height,
    originalWidth,
    originalHeight,
    crop,
    wasScaled: scale < 1,
  };
}

export function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image data.'));
    reader.readAsDataURL(blob);
  });
}

export async function canvasDataUrlFromImage(
  imageUrl: string,
  maxDimension = 1800,
): Promise<string> {
  const image = new Image();
  image.src = imageUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not prepare OCR image.'));
  });
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) return imageUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
