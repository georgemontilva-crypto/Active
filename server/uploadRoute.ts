import express, { type Express } from "express";
import { getAdminSessionToken, verifyAppSession } from "./auth";
import * as db from "./db";
import { isStorageConfigured, missingStorageVars, storagePut } from "./storage";

/** 30 MB. Un COA son 1-5 MB; por encima de esto casi siempre es un archivo equivocado. */
const MAX_BYTES = 30 * 1024 * 1024;

function safeFileName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(-120) || "file"
  );
}

/**
 * Subida a través del servidor.
 *
 * La vía normal es la URL firmada: el navegador manda el archivo directo a R2 y
 * el servidor ni lo toca. Pero eso exige que el bucket permita PUT por CORS
 * desde el dominio del sitio, y esa configuración vive en Cloudflare, fuera del
 * repo: mientras no esté puesta —o si alguien la cambia— no se puede subir nada
 * y el navegador ni siquiera dice por qué.
 *
 * Esta ruta es el camino que no depende de eso. El archivo llega al servidor y
 * el servidor lo pone en R2 con las mismas credenciales que ya usa para
 * borrarlo: sin preflight, sin CORS, sin configuración externa. A cambio, los
 * bytes pasan por el contenedor, que es la razón por la que hay un tope de
 * tamaño y por la que la URL firmada sigue siendo la opción preferente cuando
 * funciona.
 */
export function registerUploadRoute(app: Express) {
  app.post(
    "/api/admin/upload",
    express.raw({ type: "*/*", limit: MAX_BYTES }),
    async (req, res) => {
      try {
        const session = await verifyAppSession(getAdminSessionToken(req), "admin");
        if (!session || !(await db.getAdminById(session.sub))) {
          res.status(401).json({ error: "Admin authentication required" });
          return;
        }

        if (!isStorageConfigured()) {
          res.status(503).json({
            error: `Storage is not configured. Missing: ${missingStorageVars().join(", ")}`,
          });
          return;
        }

        const kind = String(req.query.kind ?? "");
        if (kind !== "lab-report" && kind !== "product-image") {
          res.status(400).json({ error: "Unknown upload kind" });
          return;
        }

        const fileName = safeFileName(String(req.query.fileName ?? "file"));
        const mimeType = req.headers["content-type"] ?? "application/octet-stream";

        if (kind === "lab-report" && mimeType !== "application/pdf") {
          res.status(400).json({ error: "Lab reports must be PDF files" });
          return;
        }
        if (kind === "product-image" && !String(mimeType).startsWith("image/")) {
          res.status(400).json({ error: "Product images must be image files" });
          return;
        }

        const body = req.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ error: "Empty upload" });
          return;
        }

        const { key, url } = await storagePut(`${kind}s/${fileName}`, body, String(mimeType));

        res.json({
          storageKey: key,
          publicUrl: url,
          fileName,
          sizeBytes: body.length,
          mimeType: String(mimeType),
        });
      } catch (err) {
        console.error("[upload] failed:", err);
        res.status(500).json({
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }
  );
}
