import { DEFAULT_MAX_VERIFICATIONS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminAuthedProcedure, appRouterFactory, publicProc } from "../appTrpc";
import * as db from "../db";

function clientIp(req: any): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

/**
 * What the public sees. A code that exists but has spent its allowance, a code
 * an admin disabled, and a code that was never issued all return the same
 * `invalid` — telling a counterfeiter "this code is real but used up" confirms
 * the code is worth reprinting, and telling them "not found" for the fakes lets
 * them work out which of their copies came from a genuine label.
 *
 * The distinction is preserved in the query log, where it is useful and not
 * visible to whoever is testing codes.
 */
type PublicResult =
  | {
      valid: true;
      code: string;
      product: { name: string; subtitle: string | null; imageUrl: string | null } | null;
      batch: string | null;
      verificationCount: number;
      maxVerifications: number;
      previouslyVerified: boolean;
      firstVerifiedAt: Date | null;
    }
  | { valid: false; code: string };

export const codesRouter = appRouterFactory({
  /** PUBLIC: verify a code typed by a customer. Every attempt is logged. */
  verify: publicProc
    .input(z.object({ code: z.string().min(1).max(128) }))
    .mutation(async ({ input, ctx }): Promise<PublicResult> => {
      const code = input.code.trim();
      const outcome = await db.consumeVerification(code);

      const ip = clientIp(ctx.req);
      const userAgent = (ctx.req.headers["user-agent"] as string) ?? null;

      if (outcome.status === "not_found") {
        await db.insertQueryLog({ code, result: "not_found", ip, userAgent });
        return { valid: false, code };
      }

      if (outcome.status === "disabled") {
        await db.insertQueryLog({
          code,
          result: "disabled",
          attemptNumber: outcome.attemptNumber,
          ip,
          userAgent,
        });
        return { valid: false, code };
      }

      if (outcome.status === "limit_reached") {
        await db.insertQueryLog({
          code,
          result: "limit_reached",
          attemptNumber: outcome.attemptNumber,
          ip,
          userAgent,
        });
        return { valid: false, code };
      }

      await db.insertQueryLog({
        code,
        result: "valid",
        attemptNumber: outcome.attemptNumber,
        ip,
        userAgent,
      });

      return {
        valid: true,
        code,
        product: outcome.product
          ? {
              name: outcome.product.name,
              subtitle: outcome.product.subtitle,
              imageUrl: outcome.product.imageUrl,
            }
          : null,
        batch: outcome.code.batch,
        verificationCount: outcome.code.verificationCount,
        maxVerifications: outcome.code.maxVerifications,
        previouslyVerified: outcome.code.verificationCount > 1,
        firstVerifiedAt: outcome.code.firstVerifiedAt,
      };
    }),

  /* ─── Admin: codes ──────────────────────────────────────────────────────── */

  adminList: adminAuthedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        productId: z.number().int().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const { rows, total } = await db.listAuthCodes({
        search: input.search?.trim() || undefined,
        productId: input.productId,
        limit: input.pageSize,
        offset,
      });
      return { rows, total, page: input.page, pageSize: input.pageSize };
    }),

  adminAdd: adminAuthedProcedure
    .input(
      z.object({
        code: z.string().min(1).max(128),
        productId: z.number().int().nullable().optional(),
        batch: z.string().max(128).nullable().optional(),
        maxVerifications: z.number().int().min(1).max(100).default(DEFAULT_MAX_VERIFICATIONS),
      })
    )
    .mutation(async ({ input }) => {
      await db.addAuthCode({
        code: input.code.trim(),
        productId: input.productId ?? null,
        batch: input.batch?.trim() || null,
        maxVerifications: input.maxVerifications,
      });
      return { success: true };
    }),

  /**
   * Bulk import from a pasted list or an uploaded CSV/TXT.
   *
   * Codes are taken one per line or comma-separated. Lines that are obviously a
   * spreadsheet header are dropped so exporting from Excel and importing here
   * doesn't create a code literally named "code".
   */
  adminBulkImport: adminAuthedProcedure
    .input(
      z.object({
        content: z.string().min(1),
        productId: z.number().int().nullable().optional(),
        batch: z.string().max(128).nullable().optional(),
        maxVerifications: z.number().int().min(1).max(100).default(DEFAULT_MAX_VERIFICATIONS),
      })
    )
    .mutation(async ({ input }) => {
      const tokens = input.content
        .split(/[\r\n,;\t]+/)
        .map((t) => t.trim().replace(/^["']|["']$/g, ""))
        .filter((t) => t.length > 0 && !/^(id|code|codes|created|updated|product|batch)$/i.test(t));

      if (tokens.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No codes found in that file" });
      }

      const { processed, skipped } = await db.bulkInsertAuthCodes(tokens, {
        productId: input.productId ?? null,
        batch: input.batch?.trim() || null,
        maxVerifications: input.maxVerifications,
      });
      return { success: true, processed, skipped };
    }),

  /**
   * Reasigna producto / lote / cupo a códigos ya cargados.
   *
   * El alcance se pide explícito y `all` no es el valor por defecto: un UPDATE
   * sin filtro sobre esta tabla reescribe todos los códigos en circulación.
   */
  adminBulkAssign: adminAuthedProcedure
    .input(
      z.object({
        scope: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("all") }),
          z.object({ kind: z.literal("unassigned") }),
          z.object({ kind: z.literal("batch"), batch: z.string().min(1).max(128) }),
          z.object({ kind: z.literal("search"), search: z.string().min(1).max(128) }),
        ]),
        productId: z.number().int().nullable().optional(),
        batch: z.string().max(128).nullable().optional(),
        maxVerifications: z.number().int().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { scope, ...data } = input;
      const updated = await db.bulkAssignAuthCodes(scope, {
        ...data,
        batch: data.batch === undefined ? undefined : data.batch?.trim() || null,
      });
      return { success: true, updated };
    }),

  /** Cuántos códigos tocaría un adminBulkAssign con ese alcance, para confirmar antes. */
  adminCountScope: adminAuthedProcedure
    .input(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("all") }),
        z.object({ kind: z.literal("unassigned") }),
        z.object({ kind: z.literal("batch"), batch: z.string().min(1).max(128) }),
        z.object({ kind: z.literal("search"), search: z.string().min(1).max(128) }),
      ])
    )
    .query(async ({ input }) => ({ count: await db.countAuthCodes(input) })),

  adminUpdate: adminAuthedProcedure
    .input(
      z.object({
        id: z.number().int(),
        productId: z.number().int().nullable().optional(),
        batch: z.string().max(128).nullable().optional(),
        maxVerifications: z.number().int().min(1).max(100).optional(),
        disabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await db.updateAuthCode(id, rest);
      return { success: true };
    }),

  /** Restores a code's full allowance after a genuine customer mis-scan. */
  adminResetCount: adminAuthedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await db.resetAuthCodeCount(input.id);
      return { success: true };
    }),

  adminDelete: adminAuthedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await db.deleteAuthCode(input.id);
      return { success: true };
    }),

  /* ─── Admin: logs ───────────────────────────────────────────────────────── */

  adminLogs: adminAuthedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        result: z.enum(["valid", "not_found", "limit_reached", "disabled"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const { rows, total } = await db.listQueryLogs({
        search: input.search?.trim() || undefined,
        result: input.result,
        limit: input.pageSize,
        offset,
      });
      return { rows, total, page: input.page, pageSize: input.pageSize };
    }),
});
