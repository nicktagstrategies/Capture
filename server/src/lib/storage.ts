import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env.js';

/**
 * S3-compatible object storage. Works with AWS S3 (default) or any compatible
 * provider (MinIO, R2) by setting `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE`.
 *
 * Galleries upload originals here; we never proxy bytes through the API server.
 * Clients PUT directly to the presigned URL we hand them and GET via signed
 * download URLs we generate per-request.
 */

const client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials:
    env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
});

function bucket(): string {
  if (!env.S3_BUCKET) throw new Error('S3_BUCKET is not configured');
  return env.S3_BUCKET;
}

export function newGalleryItemKey(galleryId: string, mimeType: string): string {
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/heic' ? 'heic' : 'jpg';
  return `galleries/${galleryId}/${crypto.randomBytes(12).toString('hex')}.${ext}`;
}

export async function presignUpload(key: string, mimeType: string, ttlSec = 600): Promise<string> {
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mimeType }),
    { expiresIn: ttlSec },
  );
}

export async function presignDownload(key: string, ttlSec = 600): Promise<string> {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: ttlSec,
  });
}

export async function deleteObject(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
