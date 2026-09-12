/**
 * Object storage backed by Cloudflare R2 (S3-compatible).
 *
 * Replaces the Manus Forge storage the template shipped with, which is not
 * reachable from Railway.
 *
 * Uploads use presigned PUT URLs: the browser sends the file straight to R2 and
 * never through the Node process. That matters here because the site stores 3D
 * models and video — routing those through tRPC as base64 would inflate them by
 * a third and hold the whole file in the container's memory.
 *
 * Reads go through the bucket's public URL, so images and models are served by
 * Cloudflare's CDN rather than by Railway.
 *
 * Required env (see DEPLOY.md):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET, R2_PUBLIC_URL
 */

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const R2_BUCKET = process.env.R2_BUCKET ?? "";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");

/** True when every R2 variable is present. Surfaced to the admin panel. */
export function isStorageConfigured(): boolean {
  return Boolean(
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL
  );
}

/** Names the missing variables so the admin sees exactly what to set. */
export function missingStorageVars(): string[] {
  const missing: string[] = [];
  if (!R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!R2_BUCKET) missing.push("R2_BUCKET");
  if (!R2_PUBLIC_URL) missing.push("R2_PUBLIC_URL");
  return missing;
}

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      `Storage not configured. Missing environment variables: ${missingStorageVars().join(", ")}`
    );
  }
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/** Appends a short random suffix so re-uploading the same filename busts caches. */
function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

/** Public CDN URL for a stored object. */
export function publicUrlFor(key: string): string {
  return `${R2_PUBLIC_URL}/${normalizeKey(key)}`;
}

/**
 * Issues a presigned PUT URL. The browser uploads directly to R2 with this URL
 * and the exact Content-Type it was signed for.
 */
export async function storagePresignPut(
  relKey: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<{ key: string; uploadUrl: string; publicUrl: string }> {
  const client = getClient();
  const key = appendHashSuffix(normalizeKey(relKey));

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds }
  );

  return { key, uploadUrl, publicUrl: publicUrlFor(key) };
}

/** Server-side upload. Kept for small payloads generated on the server. */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const client = getClient();
  const key = appendHashSuffix(normalizeKey(relKey));

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: typeof data === "string" ? Buffer.from(data) : Buffer.from(data),
      ContentType: contentType,
    })
  );

  return { key, url: publicUrlFor(key) };
}

export async function storageDelete(relKey: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: normalizeKey(relKey) })
  );
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: publicUrlFor(key) };
}
