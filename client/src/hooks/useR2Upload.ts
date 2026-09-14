import { trpc } from "@/lib/trpc";
import { useState } from "react";

type Kind = "lab-report" | "product-image";

export type UploadedFile = {
  storageKey: string;
  publicUrl: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
};

/**
 * Subida con dos caminos: directo a R2 con URL firmada, y el servidor como
 * respaldo si el navegador no logra hacer ese PUT (ver `upload`).
 *
 * XMLHttpRequest y no fetch, solo porque reporta progreso de subida. Un COA son
 * varios megas y el admin suele estar en un móvil con datos; un spinner que no
 * se mueve es indistinguible de uno colgado, y lo que sigue siempre es volver a
 * pulsar el botón.
 */
export function useR2Upload() {
  const [progress, setProgress] = useState<number | null>(null);
  const presign = trpc.catalog.presignUpload.useMutation();

  /** Sube por el propio servidor: sin preflight, sin CORS en el bucket. */
  const uploadViaServer = (file: File, kind: Kind, mimeType: string) =>
    new Promise<UploadedFile>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const qs = new URLSearchParams({ kind, fileName: file.name });
      xhr.open("POST", `/api/admin/upload?${qs}`, true);
      xhr.setRequestHeader("Content-Type", mimeType);
      xhr.withCredentials = true;
      xhr.upload.onprogress = e => {
        if (e.lengthComputable)
          setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as UploadedFile);
          } catch {
            reject(new Error("The server replied with something unreadable"));
          }
          return;
        }
        let message = `Upload failed with status ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* la respuesta no era JSON; se queda el mensaje genérico */
        }
        reject(new Error(message));
      };
      xhr.onerror = () =>
        reject(new Error("Upload failed: could not reach the server"));
      xhr.send(file);
    });

  /**
   * Sube el archivo, prefiriendo la vía directa a R2 y cayendo al servidor.
   *
   * La directa es mejor cuando funciona: los bytes no pasan por el contenedor.
   * Pero depende de que el bucket permita PUT por CORS desde este dominio, y
   * esa configuración vive en Cloudflare, fuera del repo. Cuando no está, el
   * navegador falla sin decir por qué, así que en vez de dejar al admin
   * bloqueado esperando a que alguien toque un panel ajeno, se reintenta por el
   * servidor y la subida termina igual.
   */
  const upload = async (file: File, kind: Kind): Promise<UploadedFile> => {
    setProgress(0);
    const mimeType =
      file.type || (kind === "lab-report" ? "application/pdf" : "image/jpeg");

    try {
      try {
        const { storageKey, uploadUrl, publicUrl } = await presign.mutateAsync({
          kind,
          fileName: file.name,
          mimeType,
        });

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl, true);
          // Must match the Content-Type the URL was signed for, or R2 rejects it.
          xhr.setRequestHeader("Content-Type", mimeType);
          xhr.upload.onprogress = e => {
            if (e.lengthComputable)
              setProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(
                  new Error(`Direct upload failed with status ${xhr.status}`)
                );
          // El navegador no le cuenta a XHR por qué falló un preflight: CORS,
          // DNS caído y bucket inexistente llegan como el mismo evento vacío.
          xhr.onerror = () => reject(new Error("Direct upload blocked"));
          xhr.send(file);
        });

        return {
          storageKey,
          publicUrl,
          fileName: file.name,
          sizeBytes: file.size,
          mimeType,
        };
      } catch (directError) {
        console.warn(
          "[upload] direct-to-R2 failed, falling back to the server:",
          directError
        );
        setProgress(0);
        return await uploadViaServer(file, kind, mimeType);
      }
    } finally {
      setProgress(null);
    }
  };

  return { upload, progress, isUploading: progress !== null };
}
