import dotenv from 'dotenv';
import crypto from 'node:crypto';

dotenv.config({ path: ['../.env.local', '../.env', '.env.local', '.env'] });

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || 'qxjuwofk';
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || process.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'mindshare_preset';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

export interface CloudinaryUploadResponse {
  url: string;
  secure_url: string;
  public_id?: string;
  success: boolean;
  error?: string;
}

/**
 * Uploads an image (base64 data-URI or image buffer) to Cloudinary.
 */
export async function uploadToCloudinary(base64Data: string): Promise<CloudinaryUploadResponse> {
  const cloudName = CLOUDINARY_CLOUD_NAME;
  const uploadPreset = CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName) {
    console.log('[Cloudinary] No CLOUDINARY_CLOUD_NAME specified. Returning data-URI directly.');
    return {
      url: base64Data,
      secure_url: base64Data,
      success: true,
    };
  }

  try {
    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    const formData = new URLSearchParams();
    formData.append('file', base64Data);
    formData.append('upload_preset', uploadPreset);

    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Cloudinary upload failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      url: data.url || data.secure_url,
      secure_url: data.secure_url || data.url,
      public_id: data.public_id,
      success: true,
    };
  } catch (err: any) {
    console.error('[Cloudinary Upload Error]:', err.message);
    return {
      url: base64Data,
      secure_url: base64Data,
      success: false,
      error: err.message,
    };
  }
}

/**
 * Extracts public_id from a Cloudinary URL.
 */
export function extractCloudinaryPublicId(url: string): string | null {
  if (!url || !url.includes('cloudinary.com')) return null;
  try {
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;
    const path = parts[1];
    const withoutVersion = path.replace(/^v\d+\//, '');
    const lastDot = withoutVersion.lastIndexOf('.');
    if (lastDot !== -1) {
      return withoutVersion.substring(0, lastDot);
    }
    return withoutVersion;
  } catch (e) {
    return null;
  }
}

/**
 * Deletes an image from Cloudinary by public_id or image URL.
 */
export async function deleteFromCloudinary(publicIdOrUrl: string): Promise<boolean> {
  const cloudName = CLOUDINARY_CLOUD_NAME;
  const apiKey = CLOUDINARY_API_KEY;
  const apiSecret = CLOUDINARY_API_SECRET;

  const publicId = publicIdOrUrl.startsWith('http')
    ? extractCloudinaryPublicId(publicIdOrUrl)
    : publicIdOrUrl;

  if (!publicId || !cloudName) return false;

  if (!apiKey || !apiSecret) {
    console.log(`[Cloudinary Delete] Removed image reference: ${publicId}`);
    return true;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const strToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(strToSign).digest('hex');

    const formData = new URLSearchParams();
    formData.append('public_id', publicId);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    console.log(`[Cloudinary Destroy] ${publicId} ->`, data.result);
    return data.result === 'ok';
  } catch (err: any) {
    console.error('[Cloudinary Destroy Error]:', err.message);
    return false;
  }
}
