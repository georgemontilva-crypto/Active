/**
 * Copies externally-hosted lab reports into our own R2 bucket and repoints the
 * database rows at the copy.
 *
 * Reports added by URL (the `Link an existing PDF` option, and the ones the
 * seed loads) store no `fileKey`: the file lives on someone else's server. That
 * is fine until that server moves, expires or 404s, at which point every COA
 * link on the site breaks at once and nothing in our database can repair it.
 * This mirrors them so the site owns its own copies.
 *
 * Idempotent: a row that already has a `fileKey` is ours already and is skipped,
 * so re-running this after adding a couple more linked reports only picks up
 * the new ones.
 *
 * Two ways to run it, same logic:
 *
 *   DATABASE_URL="…" pnpm mirror-reports   (from a machine that can reach the DB)
 *   MIRROR_REPORTS=true                     (set on the server; runs once at boot)
 */
import "dotenv/config";
import * as db from "./db";
import { isStorageConfigured, missingStorageVars, storagePut } from "./storage";

/** Keeps a user-supplied filename safe to use as part of an object key. */
function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "report.pdf";
}

export async function mirrorExternalReports(): Promise<void> {
  if (!isStorageConfigured()) {
    throw new Error(`Storage not configured. Missing: ${missingStorageVars().join(", ")}`);
  }

  const reports = await db.listLabReports();
  const external = reports.filter((r) => !r.fileKey && /^https?:\/\//i.test(r.fileUrl));

  if (external.length === 0) {
    console.log("[Mirror] Nothing to do — every report is already stored in R2.");
    return;
  }

  console.log(`[Mirror] ${external.length} externally-hosted report(s) to copy.`);

  let copied = 0;
  for (const report of external) {
    const label = report.batch ? `batch ${report.batch}` : report.title;
    try {
      const res = await fetch(report.fileUrl);
      if (!res.ok) {
        console.error(`[Mirror] ! ${label}: source returned ${res.status}, skipping`);
        continue;
      }

      const bytes = Buffer.from(await res.arrayBuffer());

      // A WordPress 404 page is a 200 with HTML in it, and storing that as a
      // COA would replace a working external link with a broken local one.
      // Every real PDF starts with %PDF.
      if (bytes.subarray(0, 4).toString("ascii") !== "%PDF") {
        console.error(`[Mirror] ! ${label}: response is not a PDF, skipping`);
        continue;
      }

      const fileName = safeFileName(
        report.fileName || decodeURIComponent(report.fileUrl.split("/").pop() || "report.pdf")
      );
      const { key, url } = await storagePut(
        `lab-reports/${fileName}`,
        bytes,
        "application/pdf"
      );

      await db.updateLabReport(report.id, {
        fileUrl: url,
        fileKey: key,
        fileName,
        sizeBytes: bytes.length,
      });

      copied++;
      console.log(`[Mirror] + ${label} (${Math.round(bytes.length / 1024)} KB)`);
    } catch (err) {
      console.error(`[Mirror] ! ${label}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`[Mirror] Done. ${copied} of ${external.length} copied into R2.`);
}

/**
 * Boot hook, gated so a container restart doesn't re-run it. Skipped entirely
 * when storage isn't configured, and a failure is logged rather than thrown:
 * the existing external links keep working, so this is never worth refusing to
 * start the site over.
 */
export async function mirrorExternalReportsIfRequested(): Promise<void> {
  if (process.env.MIRROR_REPORTS !== "true") return;
  try {
    console.log("[Mirror] MIRROR_REPORTS is set — copying linked PDFs into R2…");
    await mirrorExternalReports();
  } catch (err) {
    console.error("[Mirror] FAILED — the existing links still work:", err);
  }
}

/** CLI entry point: `pnpm mirror-reports`. */
const isCli =
  process.argv[1]?.endsWith("mirrorReports.ts") || process.argv[1]?.endsWith("mirrorReports.js");
if (isCli) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  mirrorExternalReports()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Mirror failed:", err);
      process.exit(1);
    });
}
