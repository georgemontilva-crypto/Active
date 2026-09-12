import { trpc } from "@/lib/trpc";
import { useState } from "react";

export type UploadedFile = {
  storageKey: string;
  publicUrl: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
};

/**
 * Two-step upload: ask the server for a presigned PUT URL, then send the file
 * straight from the browser to R2.
 *
 * XMLHttpRequest rather than fetch, only because it reports upload progress.
 * Lab reports are routinely several megabytes and the admin is often on a phone
 * tethered in a warehouse; a spinner with no movement is indistinguishable from
 * a stall, and the usual response is to press the button again.
 */
export function useR2Upload() {
  const [progress, setProgress] = useState<number | null>(null);
  const presign = trpc.catalog.presignUpload.useMutation();

  const upload = async (
    file: File,
    kind: "lab-report" | "product-image"
  ): Promise<UploadedFile> => {
    setProgress(0);
    try {
      const mimeType = file.type || (kind === "lab-report" ? "application/pdf" : "image/jpeg");
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
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed with status ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Upload failed: network error"));
        xhr.send(file);
      });

      return {
        storageKey,
        publicUrl,
        fileName: file.name,
        sizeBytes: file.size,
        mimeType,
      };
    } finally {
      setProgress(null);
    }
  };

  return { upload, progress, isUploading: progress !== null };
}
