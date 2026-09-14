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

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const R2_BUCKET = process.env.R2_BUCKET ?? "";
/**
 * Base pública del bucket, saneada.
 *
 * Pegar variables en el panel de Railway es propenso a que dos valores acaben
 * en el mismo campo ("…r2.devR2_BUCKET=algo"), y el resultado no falla al
 * arrancar: se guarda tal cual en la URL de cada archivo subido y solo se
 * descubre cuando alguien hace clic y el enlace no abre. Aquí se corta todo lo
 * que venga después del host y se avisa por consola, porque una URL base con
 * ruta o con basura pegada nunca es lo que se quiso escribir.
 */
const R2_PUBLIC_URL = sanitizePublicUrl(process.env.R2_PUBLIC_URL ?? "");

function sanitizePublicUrl(raw: string): string {
  let trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  /* Caso concreto y frecuente: el valor de la siguiente variable pegado al
     final, sin separador ("…r2.devR2_BUCKET=active"). No lo detecta el parser
     de URL porque "=" y "_" son válidos en un nombre de host, así que el
     resultado es una URL bien formada que apunta a un dominio inexistente. */
  const glued = trimmed.match(/^(https?:\/\/[^\s]*?)(R2_[A-Z_]+=.*)$/i);
  if (glued) {
    console.warn(
      `[storage] R2_PUBLIC_URL traía otra variable pegada ("${glued[2]}"). ` +
        `Revísala en Railway: son dos valores en el mismo campo.`
    );
    trimmed = glued[1].replace(/\/+$/, "");
  }

  try {
    const url = new URL(trimmed);
    const clean = `${url.protocol}//${url.host}`;

    /* Un host con caracteres que no existen en un dominio real es basura
       pegada, no un dominio raro: mejor decirlo que servir enlaces muertos. */
    if (!/^[a-z0-9.-]+$/i.test(url.hostname)) {
      console.error(
        `[storage] R2_PUBLIC_URL tiene un dominio imposible: "${url.hostname}". ` +
          `Los enlaces a archivos subidos no van a abrir.`
      );
    } else if (clean !== trimmed) {
      console.warn(
        `[storage] R2_PUBLIC_URL venía como "${raw.trim()}" y se usará "${clean}".`
      );
    }
    return clean;
  } catch {
    console.error(
      `[storage] R2_PUBLIC_URL no es una URL válida: "${trimmed}". Los enlaces a archivos subidos no van a abrir.`
    );
    return trimmed;
  }
}

/** La base pública que el servidor está usando de verdad, para mostrarla en el panel. */
export function publicBaseUrl(): string {
  return R2_PUBLIC_URL;
}

/** True when every R2 variable is present. Surfaced to the admin panel. */
export function isStorageConfigured(): boolean {
  return Boolean(
    R2_ACCOUNT_ID &&
      R2_ACCESS_KEY_ID &&
      R2_SECRET_ACCESS_KEY &&
      R2_BUCKET &&
      R2_PUBLIC_URL
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
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
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

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: publicUrlFor(key) };
}
