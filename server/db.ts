import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  adminUsers,
  authCodes,
  InsertAdminUser,
  type AuthCode,
  type Product,
  InsertLabReport,
  InsertProduct,
  InsertUser,
  labReports,
  products,
  queryLogs,
  siteSettings,
  users,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

/* ─── Manus users (template compatibility) ────────────────────────────────── */

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  (["name", "email", "loginMethod"] as const).forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    (values as any)[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0] ?? null;
}

/* ─── Admin accounts ──────────────────────────────────────────────────────── */

export async function countAdmins(): Promise<number> {
  const db = await requireDb();
  const rows = await db.select({ c: sql<number>`count(*)` }).from(adminUsers);
  return Number(rows[0]?.c ?? 0);
}

export async function createAdmin(data: InsertAdminUser) {
  const db = await requireDb();
  await db.insert(adminUsers).values(data);
}

export async function getAdminByEmail(email: string) {
  const db = await requireDb();
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function getAdminById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listAdmins() {
  const db = await requireDb();
  return db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      createdAt: adminUsers.createdAt,
      lastSignedIn: adminUsers.lastSignedIn,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.id));
}

export async function updateAdminLastSignedIn(id: number) {
  const db = await requireDb();
  await db.update(adminUsers).set({ lastSignedIn: new Date() }).where(eq(adminUsers.id, id));
}

export async function updateAdminPassword(id: number, passwordHash: string) {
  const db = await requireDb();
  await db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, id));
}

export async function deleteAdmin(id: number) {
  const db = await requireDb();
  await db.delete(adminUsers).where(eq(adminUsers.id, id));
}

/* ─── Products ────────────────────────────────────────────────────────────── */

export async function listProducts(opts: { publishedOnly?: boolean } = {}) {
  const db = await requireDb();
  const base = db.select().from(products);
  const rows = opts.publishedOnly
    ? await base.where(eq(products.published, true)).orderBy(asc(products.sortOrder), asc(products.name))
    : await base.orderBy(asc(products.sortOrder), asc(products.name));
  return rows;
}

export async function getProductById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getProductBySlug(slug: string) {
  const db = await requireDb();
  const rows = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function createProduct(data: InsertProduct) {
  const db = await requireDb();
  await db.insert(products).values(data);
  return getProductBySlug(data.slug);
}

export async function updateProduct(id: number, data: Partial<InsertProduct>) {
  const db = await requireDb();
  await db.update(products).set(data).where(eq(products.id, id));
  return getProductById(id);
}

export async function deleteProduct(id: number) {
  const db = await requireDb();
  // Codes keep working after their product is removed; they just stop naming it.
  await db.update(authCodes).set({ productId: null }).where(eq(authCodes.productId, id));
  await db.delete(labReports).where(eq(labReports.productId, id));
  await db.delete(products).where(eq(products.id, id));
}

/* ─── Lab reports ─────────────────────────────────────────────────────────── */

/** Products with their reports nested, for the public Lab Reports page. */
export async function listProductsWithReports(opts: { publishedOnly?: boolean } = {}) {
  const db = await requireDb();
  const prodRows = await listProducts(opts);
  const base = db.select().from(labReports);
  const reportRows = opts.publishedOnly
    ? await base
        .where(eq(labReports.published, true))
        .orderBy(asc(labReports.sortOrder), desc(labReports.id))
    : await base.orderBy(asc(labReports.sortOrder), desc(labReports.id));

  const byProduct = new Map<number, typeof reportRows>();
  for (const r of reportRows) {
    const list = byProduct.get(r.productId) ?? [];
    list.push(r);
    byProduct.set(r.productId, list);
  }
  return prodRows.map((p) => ({ ...p, reports: byProduct.get(p.id) ?? [] }));
}

export async function listLabReports(productId?: number) {
  const db = await requireDb();
  const base = db.select().from(labReports);
  return productId
    ? base.where(eq(labReports.productId, productId)).orderBy(asc(labReports.sortOrder), desc(labReports.id))
    : base.orderBy(desc(labReports.id));
}

export async function getLabReportById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(labReports).where(eq(labReports.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createLabReport(data: InsertLabReport) {
  const db = await requireDb();
  await db.insert(labReports).values(data);
}

export async function updateLabReport(id: number, data: Partial<InsertLabReport>) {
  const db = await requireDb();
  await db.update(labReports).set(data).where(eq(labReports.id, id));
  return getLabReportById(id);
}

export async function deleteLabReport(id: number) {
  const db = await requireDb();
  await db.delete(labReports).where(eq(labReports.id, id));
}

/* ─── Authentication codes ────────────────────────────────────────────────── */

export type VerifyOutcome =
  | { status: "not_found" }
  | { status: "disabled"; attemptNumber: number }
  | { status: "limit_reached"; attemptNumber: number; code: AuthCode }
  | { status: "valid"; attemptNumber: number; code: AuthCode; product: Product | null };

export async function findAuthCode(code: string) {
  const db = await requireDb();
  const rows = await db.select().from(authCodes).where(eq(authCodes.code, code)).limit(1);
  return rows[0] ?? null;
}

/**
 * Spends one verification against a code and reports what happened.
 *
 * The increment is a single conditional UPDATE rather than a read followed by a
 * write. Two people scanning the same label at the same moment would otherwise
 * both read `verificationCount = 2`, both see room under the limit of 3, and
 * both write 3 — four successful checks on a code allowed three. Letting MySQL
 * evaluate the guard and the increment in one statement makes that impossible:
 * whichever UPDATE lands second matches zero rows and is reported as spent.
 */
export async function consumeVerification(rawCode: string): Promise<VerifyOutcome> {
  const db = await requireDb();
  const existing = await findAuthCode(rawCode);
  if (!existing) return { status: "not_found" };

  if (existing.disabled) {
    return { status: "disabled", attemptNumber: existing.verificationCount + 1 };
  }

  const result: any = await db
    .update(authCodes)
    .set({
      verificationCount: sql`${authCodes.verificationCount} + 1`,
      lastVerifiedAt: new Date(),
      firstVerifiedAt: sql`COALESCE(${authCodes.firstVerifiedAt}, NOW())`,
    })
    .where(
      and(
        eq(authCodes.id, existing.id),
        eq(authCodes.disabled, false),
        sql`${authCodes.verificationCount} < ${authCodes.maxVerifications}`
      )
    );

  // mysql2 surfaces the row count differently depending on driver version, so
  // read both shapes rather than trusting one.
  const affected = Number(result?.[0]?.affectedRows ?? result?.affectedRows ?? 0);

  if (affected === 0) {
    return {
      status: "limit_reached",
      attemptNumber: existing.verificationCount + 1,
      code: existing,
    };
  }

  const updated = (await findAuthCode(rawCode))!;
  const product = updated.productId ? await getProductById(updated.productId) : null;
  return {
    status: "valid",
    attemptNumber: updated.verificationCount,
    code: updated,
    product,
  };
}

export async function listAuthCodes(opts: {
  search?: string;
  productId?: number;
  limit: number;
  offset: number;
}) {
  const db = await requireDb();
  const filters = [] as any[];
  if (opts.search) {
    filters.push(or(like(authCodes.code, `%${opts.search}%`), like(authCodes.batch, `%${opts.search}%`)));
  }
  if (opts.productId) filters.push(eq(authCodes.productId, opts.productId));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: authCodes.id,
      code: authCodes.code,
      productId: authCodes.productId,
      productName: products.name,
      batch: authCodes.batch,
      verificationCount: authCodes.verificationCount,
      maxVerifications: authCodes.maxVerifications,
      disabled: authCodes.disabled,
      firstVerifiedAt: authCodes.firstVerifiedAt,
      lastVerifiedAt: authCodes.lastVerifiedAt,
      createdAt: authCodes.createdAt,
    })
    .from(authCodes)
    .leftJoin(products, eq(authCodes.productId, products.id))
    .where(where)
    .orderBy(desc(authCodes.id))
    .limit(opts.limit)
    .offset(opts.offset);

  const countRows = await db.select({ c: sql<number>`count(*)` }).from(authCodes).where(where);
  return { rows, total: Number(countRows[0]?.c ?? 0) };
}

export async function addAuthCode(data: {
  code: string;
  productId?: number | null;
  batch?: string | null;
  maxVerifications?: number;
}) {
  const db = await requireDb();
  await db
    .insert(authCodes)
    .values({
      code: data.code,
      productId: data.productId ?? null,
      batch: data.batch ?? null,
      maxVerifications: data.maxVerifications ?? 3,
    })
    .onDuplicateKeyUpdate({
      set: {
        productId: data.productId ?? null,
        batch: data.batch ?? null,
        maxVerifications: data.maxVerifications ?? 3,
      },
    });
}

/**
 * Bulk insert. Existing codes are left alone rather than reset: re-importing a
 * batch file is a common way to add the few codes that were missing, and
 * silently handing three fresh checks to codes already in circulation would
 * undo the limit for the whole batch.
 *
 * El descarte lo hace MySQL contra el índice único (`INSERT IGNORE`), no una
 * consulta previa. Con lotes de cientos de miles de códigos ese SELECT eran
 * cientos de viajes de ida y vuelta antes de escribir la primera fila.
 */
export async function bulkInsertAuthCodes(
  codes: string[],
  opts: { productId?: number | null; batch?: string | null; maxVerifications?: number } = {}
): Promise<{ processed: number; skipped: number }> {
  const db = await requireDb();
  const unique = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean)));
  if (unique.length === 0) return { processed: 0, skipped: 0 };

  let inserted = 0;
  const chunkSize = 1000;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize).map((code) => ({
      code,
      productId: opts.productId ?? null,
      batch: opts.batch ?? null,
      maxVerifications: opts.maxVerifications ?? 3,
    }));
    if (!chunk.length) continue;
    const result = (await db.insert(authCodes).ignore().values(chunk)) as unknown as [
      { affectedRows?: number },
      unknown,
    ];
    const affected = result?.[0]?.affectedRows;
    inserted += typeof affected === "number" ? affected : chunk.length;
  }

  return { processed: inserted, skipped: unique.length - inserted };
}

/**
 * Reasigna producto, lote o cupo de consultas a códigos que ya están cargados.
 *
 * Existe porque el archivo del cliente llega antes que la decisión de a qué
 * producto pertenece, y con lotes de cientos de miles de códigos corregirlo
 * fila por fila desde la tabla no es una opción.
 *
 * `scope` acota qué se toca. No hay un "todos" implícito: un UPDATE sin WHERE
 * sobre esta tabla reescribe el catálogo entero de códigos en circulación, así
 * que quien lo quiera tiene que pedirlo por su nombre.
 */
export async function bulkAssignAuthCodes(
  scope: { kind: "all" } | { kind: "unassigned" } | { kind: "batch"; batch: string } | { kind: "search"; search: string },
  data: { productId?: number | null; batch?: string | null; maxVerifications?: number }
): Promise<number> {
  const db = await requireDb();

  let where;
  if (scope.kind === "unassigned") where = sql`${authCodes.productId} is null`;
  else if (scope.kind === "batch") where = eq(authCodes.batch, scope.batch);
  else if (scope.kind === "search")
    where = or(
      like(authCodes.code, `%${scope.search}%`),
      like(authCodes.batch, `%${scope.search}%`)
    );

  const set: Record<string, unknown> = {};
  if (data.productId !== undefined) set.productId = data.productId;
  if (data.batch !== undefined) set.batch = data.batch;
  if (data.maxVerifications !== undefined) set.maxVerifications = data.maxVerifications;
  if (Object.keys(set).length === 0) return 0;

  const result = (await db.update(authCodes).set(set).where(where)) as unknown as [
    { affectedRows?: number },
    unknown,
  ];
  return result?.[0]?.affectedRows ?? 0;
}

/** Cuántos códigos tocaría un `bulkAssignAuthCodes` con ese mismo alcance. */
export async function countAuthCodes(
  scope: { kind: "all" } | { kind: "unassigned" } | { kind: "batch"; batch: string } | { kind: "search"; search: string }
): Promise<number> {
  const db = await requireDb();
  let where;
  if (scope.kind === "unassigned") where = sql`${authCodes.productId} is null`;
  else if (scope.kind === "batch") where = eq(authCodes.batch, scope.batch);
  else if (scope.kind === "search")
    where = or(
      like(authCodes.code, `%${scope.search}%`),
      like(authCodes.batch, `%${scope.search}%`)
    );
  const rows = await db.select({ c: sql<number>`count(*)` }).from(authCodes).where(where);
  return Number(rows[0]?.c ?? 0);
}

export async function updateAuthCode(
  id: number,
  data: { productId?: number | null; batch?: string | null; maxVerifications?: number; disabled?: boolean }
) {
  const db = await requireDb();
  await db.update(authCodes).set(data).where(eq(authCodes.id, id));
}

/** Gives a code its full allowance back. Used when a customer reports a genuine mis-scan. */
export async function resetAuthCodeCount(id: number) {
  const db = await requireDb();
  await db
    .update(authCodes)
    .set({ verificationCount: 0, firstVerifiedAt: null, lastVerifiedAt: null })
    .where(eq(authCodes.id, id));
}

export async function deleteAuthCode(id: number) {
  const db = await requireDb();
  await db.delete(authCodes).where(eq(authCodes.id, id));
}

/* ─── Query logs ──────────────────────────────────────────────────────────── */

export async function insertQueryLog(data: {
  code: string;
  result: "valid" | "not_found" | "limit_reached" | "disabled";
  attemptNumber?: number | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(queryLogs).values(data);
}

export async function listQueryLogs(opts: {
  search?: string;
  result?: "valid" | "not_found" | "limit_reached" | "disabled";
  limit: number;
  offset: number;
}) {
  const db = await requireDb();
  const filters = [] as any[];
  if (opts.search) filters.push(like(queryLogs.code, `%${opts.search}%`));
  if (opts.result) filters.push(eq(queryLogs.result, opts.result));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(queryLogs)
    .where(where)
    .orderBy(desc(queryLogs.id))
    .limit(opts.limit)
    .offset(opts.offset);

  const countRows = await db.select({ c: sql<number>`count(*)` }).from(queryLogs).where(where);
  return { rows, total: Number(countRows[0]?.c ?? 0) };
}

/* ─── Dashboard ───────────────────────────────────────────────────────────── */

export async function getDashboardStats() {
  const db = await requireDb();
  const [codes] = await db.select({ c: sql<number>`count(*)` }).from(authCodes);
  const [used] = await db
    .select({ c: sql<number>`count(*)` })
    .from(authCodes)
    .where(sql`${authCodes.verificationCount} > 0`);
  const [spent] = await db
    .select({ c: sql<number>`count(*)` })
    .from(authCodes)
    .where(sql`${authCodes.verificationCount} >= ${authCodes.maxVerifications}`);
  const [logs] = await db.select({ c: sql<number>`count(*)` }).from(queryLogs);
  const [valid] = await db
    .select({ c: sql<number>`count(*)` })
    .from(queryLogs)
    .where(eq(queryLogs.result, "valid"));
  const [blocked] = await db
    .select({ c: sql<number>`count(*)` })
    .from(queryLogs)
    .where(eq(queryLogs.result, "limit_reached"));
  const [notFound] = await db
    .select({ c: sql<number>`count(*)` })
    .from(queryLogs)
    .where(eq(queryLogs.result, "not_found"));
  const [prods] = await db.select({ c: sql<number>`count(*)` }).from(products);
  const [reports] = await db.select({ c: sql<number>`count(*)` }).from(labReports);

  return {
    totalCodes: Number(codes?.c ?? 0),
    usedCodes: Number(used?.c ?? 0),
    spentCodes: Number(spent?.c ?? 0),
    totalLogs: Number(logs?.c ?? 0),
    validLogs: Number(valid?.c ?? 0),
    blockedLogs: Number(blocked?.c ?? 0),
    notFoundLogs: Number(notFound?.c ?? 0),
    totalProducts: Number(prods?.c ?? 0),
    totalReports: Number(reports?.c ?? 0),
  };
}

/* ─── Site settings ───────────────────────────────────────────────────────── */

export async function getSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(siteSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

export async function setSetting(key: string, value: string) {
  const db = await requireDb();
  await db.insert(siteSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
  return { key, value };
}
