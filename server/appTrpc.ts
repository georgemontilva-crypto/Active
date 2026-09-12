import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./_core/context";
import { getAdminSessionToken, verifyAppSession } from "./auth";
import * as db from "./db";

/**
 * A separate tRPC instance that resolves the admin session from its own cookie,
 * independent of the Manus OAuth `ctx.user` the template ships with.
 */
const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const appRouterFactory = t.router;
export const publicProc = t.procedure;

export const adminAuthedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const token = getAdminSessionToken(ctx.req);
  const session = await verifyAppSession(token, "admin");
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin authentication required" });
  }
  const admin = await db.getAdminById(session.sub);
  if (!admin) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin not found" });
  }
  return next({ ctx: { ...ctx, admin } });
});
