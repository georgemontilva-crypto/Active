import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminAuthedProcedure, appRouterFactory, publicProc } from "../appTrpc";
import * as db from "../db";
import {
  isStorageConfigured,
  missingStorageVars,
  storageDelete,
  storagePresignPut,
} from "../storage";

/** Keeps a user-supplied filename safe to use as part of an object key. */
function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}

function requireStorage() {
  if (!isStorageConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Storage not configured. Missing: ${missingStorageVars().join(", ")}`,
    });
  }
}

export const catalogRouter = appRouterFactory({
  /* ─── Public ────────────────────────────────────────────────────────────── */

  /**
   * Everything the Lab Reports page renders, in one round trip: published
   * products with their published reports nested. The page is a flat list that
   * is read top to bottom, so paginating or lazy-loading per product would add
   * requests without removing anything from the screen.
   */
  publicReports: publicProc.query(async () => {
    const rows = await db.listProductsWithReports({ publishedOnly: true });
    return rows.map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      collection: p.collection,
      subtitle: p.subtitle,
      description: p.description,
      imageUrl: p.imageUrl,
      reports: p.reports.map(r => ({
        id: r.id,
        title: r.title,
        batch: r.batch,
        lab: r.lab,
        testedOn: r.testedOn,
        fileUrl: r.fileUrl,
        fileName: r.fileName,
        sizeBytes: r.sizeBytes,
      })),
    }));
  }),

  /* ─── Admin: storage ────────────────────────────────────────────────────── */

  storageStatus: adminAuthedProcedure.query(() => ({
    configured: isStorageConfigured(),
    missing: missingStorageVars(),
  })),

  /**
   * Hands the browser a presigned PUT URL so the file goes straight to R2.
   *
   * Lab reports are PDFs and routinely run to several megabytes; sending them
   * through tRPC as base64 would inflate them by a third and hold the whole
   * file in the container's memory on a plan that doesn't have it to spare.
   */
  presignUpload: adminAuthedProcedure
    .input(
      z.object({
        kind: z.enum(["lab-report", "product-image"]),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      requireStorage();
      if (input.kind === "lab-report" && input.mimeType !== "application/pdf") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Lab reports must be PDF files",
        });
      }
      if (
        input.kind === "product-image" &&
        !input.mimeType.startsWith("image/")
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Product images must be image files",
        });
      }
      const key = `${input.kind}s/${safeFileName(input.fileName)}`;
      const {
        key: storageKey,
        uploadUrl,
        publicUrl,
      } = await storagePresignPut(key, input.mimeType);
      return { storageKey, uploadUrl, publicUrl };
    }),

  /* ─── Admin: products ───────────────────────────────────────────────────── */

  adminProducts: adminAuthedProcedure.query(async () => {
    return db.listProductsWithReports();
  }),

  createProduct: adminAuthedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().max(160).optional(),
        collection: z.string().max(255).nullable().optional(),
        subtitle: z.string().max(255).nullable().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z.string().max(1024).nullable().optional(),
        imageKey: z.string().max(512).nullable().optional(),
        sortOrder: z.number().int().default(0),
        published: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      // Two lines can both have a "Berry", so the slug is seeded with the
      // collection when there is one, rather than colliding on the flavour name.
      const slug = slugify(
        input.slug || [input.collection, input.name].filter(Boolean).join(" ")
      );
      if (!slug)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not derive a slug",
        });
      if (await db.getProductBySlug(slug)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A product with slug "${slug}" already exists`,
        });
      }
      const product = await db.createProduct({
        slug,
        name: input.name.trim(),
        collection: input.collection?.trim() || null,
        subtitle: input.subtitle ?? null,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        imageKey: input.imageKey ?? null,
        sortOrder: input.sortOrder,
        published: input.published,
      });
      return { success: true, product };
    }),

  updateProduct: adminAuthedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(255).optional(),
        collection: z.string().max(255).nullable().optional(),
        subtitle: z.string().max(255).nullable().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z.string().max(1024).nullable().optional(),
        imageKey: z.string().max(512).nullable().optional(),
        sortOrder: z.number().int().optional(),
        published: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const product = await db.updateProduct(id, rest);
      return { success: true, product };
    }),

  deleteProduct: adminAuthedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const reports = await db.listLabReports(input.id);
      const product = await db.getProductById(input.id);

      // Remove the objects before the rows: a failure here is logged rather
      // than thrown, so a bucket hiccup can't leave the product undeletable.
      if (isStorageConfigured()) {
        for (const key of [
          ...reports.map(r => r.fileKey),
          product?.imageKey,
        ].filter(Boolean)) {
          try {
            await storageDelete(key as string);
          } catch (err) {
            console.warn(`[catalog] failed to delete ${key} from R2:`, err);
          }
        }
      }
      await db.deleteProduct(input.id);
      return { success: true };
    }),

  /* ─── Admin: lab reports ────────────────────────────────────────────────── */

  createLabReport: adminAuthedProcedure
    .input(
      z.object({
        productId: z.number().int(),
        title: z.string().min(1).max(255),
        batch: z.string().max(128).nullable().optional(),
        lab: z.string().max(255).nullable().optional(),
        testedOn: z.string().max(32).nullable().optional(),
        fileUrl: z.string().min(1).max(1024),
        /**
         * Empty for a report that lives somewhere else (an existing WordPress
         * upload, for instance). Deleting such a row removes the row only: there
         * is no object of ours in the bucket to remove, and guessing at one
         * would mean deleting a file we never put there.
         */
        fileKey: z.string().max(512).default(""),
        fileName: z.string().max(255).nullable().optional(),
        sizeBytes: z.number().int().nonnegative().nullable().optional(),
        sortOrder: z.number().int().default(0),
        published: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      if (!(await db.getProductById(input.productId))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product not found",
        });
      }
      await db.createLabReport({
        productId: input.productId,
        title: input.title.trim(),
        batch: input.batch ?? null,
        lab: input.lab ?? null,
        testedOn: input.testedOn ?? null,
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        fileName: input.fileName ?? null,
        sizeBytes: input.sizeBytes ?? null,
        sortOrder: input.sortOrder,
        published: input.published,
      });
      return { success: true };
    }),

  updateLabReport: adminAuthedProcedure
    .input(
      z.object({
        id: z.number().int(),
        title: z.string().min(1).max(255).optional(),
        batch: z.string().max(128).nullable().optional(),
        lab: z.string().max(255).nullable().optional(),
        testedOn: z.string().max(32).nullable().optional(),
        sortOrder: z.number().int().optional(),
        published: z.boolean().optional(),
        /** Reemplazo del archivo. Los cuatro viajan juntos o no viaja ninguno. */
        fileUrl: z.string().min(1).max(1024).optional(),
        fileKey: z.string().max(512).optional(),
        fileName: z.string().max(255).nullable().optional(),
        sizeBytes: z.number().int().nonnegative().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const current = await db.getLabReportById(id);
      if (!current)
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });

      await db.updateLabReport(id, rest);

      /* El PDF viejo se borra DESPUÉS de que la fila apunta al nuevo, y solo si
         el anterior era nuestro (fileKey propio) y de verdad cambió. Al revés,
         un fallo al escribir la fila dejaría al reporte apuntando a un archivo
         que ya no existe. Un fallo aquí solo deja basura en el bucket. */
      const replaced =
        rest.fileKey !== undefined && rest.fileKey !== current.fileKey;
      if (replaced && current.fileKey && isStorageConfigured()) {
        try {
          await storageDelete(current.fileKey);
        } catch (err) {
          console.warn(
            `[catalog] failed to delete replaced ${current.fileKey} from R2:`,
            err
          );
        }
      }
      return { success: true };
    }),

  deleteLabReport: adminAuthedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const report = await db.getLabReportById(input.id);
      if (report?.fileKey && isStorageConfigured()) {
        try {
          await storageDelete(report.fileKey);
        } catch (err) {
          console.warn(
            `[catalog] failed to delete ${report.fileKey} from R2:`,
            err
          );
        }
      }
      await db.deleteLabReport(input.id);
      return { success: true };
    }),
});
