import { ADMIN_COOKIE_NAME, THIRTY_DAYS_MS } from "@shared/const";
import bcrypt from "bcryptjs";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

/**
 * Admin authentication (NOT Manus OAuth).
 * Sessions are signed JWTs stored in a dedicated httpOnly cookie.
 */

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret || "verify-dev-secret-change-me");
}

export type AppSessionKind = "admin";

export type AppSessionPayload = {
  sub: number;
  kind: AppSessionKind;
  email: string;
};

export async function signAppSession(
  payload: AppSessionPayload,
  expiresInMs: number = THIRTY_DAYS_MS
): Promise<string> {
  const expSeconds = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ sub: String(payload.sub), kind: payload.kind, email: payload.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expSeconds)
    .sign(getSecret());
}

export async function verifyAppSession(
  token: string | undefined | null,
  expectedKind: AppSessionKind
): Promise<AppSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const sub = Number(payload.sub);
    const kind = payload.kind as AppSessionKind;
    const email = payload.email as string;
    if (!Number.isFinite(sub) || kind !== expectedKind || !email) return null;
    return { sub, kind, email };
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const parsed = parseCookieHeader(req.headers.cookie ?? "");
  return parsed[name];
}

export function getAdminSessionToken(req: Request): string | undefined {
  return readCookie(req, ADMIN_COOKIE_NAME);
}

export function appCookieOptions(req: Request) {
  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0];
  const proto = forwardedProto || req.protocol;
  const secure = proto === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none" as const,
    secure,
    maxAge: THIRTY_DAYS_MS,
  };
}
