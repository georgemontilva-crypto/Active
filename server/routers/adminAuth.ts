import { ADMIN_COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { appCookieOptions, hashPassword, signAppSession, verifyPassword } from "../auth";
import { adminAuthedProcedure, appRouterFactory, publicProc } from "../appTrpc";
import * as db from "../db";
import { isStorageConfigured, missingStorageVars } from "../storage";

/**
 * Secret required to create the first admin account.
 *
 * Without it, the bootstrap endpoint would let any anonymous visitor claim the
 * admin panel for as long as `admin_users` is empty — which on a fresh deploy is
 * the entire window between the container starting and someone noticing. Set
 * `ADMIN_SETUP_TOKEN` in Railway, create the admin, then delete the variable.
 */
const ADMIN_SETUP_TOKEN = process.env.ADMIN_SETUP_TOKEN ?? "";

/** Timing-safe comparison, so the token can't be recovered from response times. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const adminAuthRouter = appRouterFactory({
  setupStatus: publicProc.query(async () => {
    const count = await db.countAdmins();
    return { needsSetup: count === 0 && ADMIN_SETUP_TOKEN.length > 0 };
  }),

  setup: publicProc
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1).optional(),
        setupToken: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_SETUP_TOKEN) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin setup is disabled on this server" });
      }
      if ((await db.countAdmins()) > 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin already configured" });
      }
      if (!safeEqual(input.setupToken, ADMIN_SETUP_TOKEN)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid setup token" });
      }
      const passwordHash = await hashPassword(input.password);
      const email = input.email.toLowerCase();
      await db.createAdmin({ email, passwordHash, name: input.name ?? null });
      const admin = await db.getAdminByEmail(email);
      if (!admin) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const token = await signAppSession({ sub: admin.id, kind: "admin", email: admin.email });
      ctx.res.cookie(ADMIN_COOKIE_NAME, token, appCookieOptions(ctx.req));
      return { success: true, admin: { id: admin.id, email: admin.email, name: admin.name } };
    }),

  login: publicProc
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const admin = await db.getAdminByEmail(input.email.toLowerCase());
      // Same message either way: distinguishing "no such account" from "wrong
      // password" turns the login form into a way to enumerate admin emails.
      if (!admin || !(await verifyPassword(input.password, admin.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }
      await db.updateAdminLastSignedIn(admin.id);
      const token = await signAppSession({ sub: admin.id, kind: "admin", email: admin.email });
      ctx.res.cookie(ADMIN_COOKIE_NAME, token, appCookieOptions(ctx.req));
      return { success: true, admin: { id: admin.id, email: admin.email, name: admin.name } };
    }),

  me: adminAuthedProcedure.query(({ ctx }) => ({
    id: ctx.admin.id,
    email: ctx.admin.email,
    name: ctx.admin.name,
  })),

  logout: publicProc.mutation(({ ctx }) => {
    ctx.res.clearCookie(ADMIN_COOKIE_NAME, { ...appCookieOptions(ctx.req), maxAge: -1 });
    return { success: true };
  }),

  /* ─── Admin account management ──────────────────────────────────────────── */

  listAdmins: adminAuthedProcedure.query(async () => db.listAdmins()),

  createAdmin: adminAuthedProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const email = input.email.toLowerCase();
      if (await db.getAdminByEmail(email)) {
        throw new TRPCError({ code: "CONFLICT", message: "That email already has an account" });
      }
      await db.createAdmin({
        email,
        passwordHash: await hashPassword(input.password),
        name: input.name ?? null,
      });
      return { success: true };
    }),

  changePassword: adminAuthedProcedure
    .input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }))
    .mutation(async ({ input, ctx }) => {
      const ok = await verifyPassword(input.currentPassword, ctx.admin.passwordHash);
      if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      await db.updateAdminPassword(ctx.admin.id, await hashPassword(input.newPassword));
      return { success: true };
    }),

  deleteAdmin: adminAuthedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.admin.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account" });
      }
      // Deleting the last admin would lock the panel with no way back in, since
      // the setup endpoint is gated on ADMIN_SETUP_TOKEN still being present.
      if ((await db.countAdmins()) <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "At least one admin must remain" });
      }
      await db.deleteAdmin(input.id);
      return { success: true };
    }),

  /* ─── Dashboard ─────────────────────────────────────────────────────────── */

  dashboardOverview: adminAuthedProcedure.query(async () => {
    const stats = await db.getDashboardStats();
    const recentLogs = await db.listQueryLogs({ limit: 8, offset: 0 });
    return {
      counts: stats,
      storage: { configured: isStorageConfigured(), missing: missingStorageVars() },
      recentLogs: recentLogs.rows.map((l) => ({
        id: l.id,
        code: l.code,
        result: l.result,
        attemptNumber: l.attemptNumber,
        createdAt: l.createdAt,
      })),
    };
  }),
});
