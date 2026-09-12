import {
  bigint,
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing the Manus OAuth flow (kept for template compatibility).
 * NOT used by this site: the admin panel has its own auth in `adminUsers`.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Admin accounts (own auth, NOT Manus OAuth).
 * Email + bcrypt hash, session carried in a signed JWT cookie.
 */
export const adminUsers = mysqlTable("admin_users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = typeof adminUsers.$inferInsert;

/**
 * A product line. Lab reports hang off a product (a product can have many), and
 * every authentication code can name the product it was printed for, so the
 * verification result can say what the customer is actually holding.
 */
export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    /** URL-safe identifier used in public links, e.g. "endless-2ct-80mg". */
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    /** Display name shown on the verification result, e.g. "Berry". */
    name: varchar("name", { length: 255 }).notNull(),
    /**
     * Product line this belongs to, e.g. "9 M-KREA(TM) COMPLEX".
     *
     * Free text rather than its own table: the grouping exists to put a heading
     * above a row of cards on one page, and a lookup table would mean two admin
     * screens and a foreign key to express a string that is typed once per line.
     */
    collection: varchar("collection", { length: 255 }),
    subtitle: varchar("subtitle", { length: 255 }),
    description: text("description"),
    /** Optional product shot, uploaded to R2. */
    imageUrl: varchar("imageUrl", { length: 1024 }),
    imageKey: varchar("imageKey", { length: 512 }),
    /** Lower sorts first; ties break on name. */
    sortOrder: int("sortOrder").default(0).notNull(),
    published: boolean("published").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    slugIdx: index("product_slug_idx").on(t.slug),
    collectionIdx: index("product_collection_idx").on(t.collection),
    sortIdx: index("product_sort_idx").on(t.sortOrder),
  })
);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * Certificates of analysis. One product can have several (different batches,
 * different panels), so this is a plain child table rather than a column on
 * `products`.
 *
 * The PDF itself lives in R2; only the public URL and the object key are kept
 * here, the key so the file can be removed from the bucket when the row is
 * deleted.
 */
export const labReports = mysqlTable(
  "lab_reports",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    /** e.g. "Potency - Batch A1042" */
    title: varchar("title", { length: 255 }).notNull(),
    /** Batch / lot number as printed on the package. Free text on purpose. */
    batch: varchar("batch", { length: 128 }),
    lab: varchar("lab", { length: 255 }),
    /** Date the sample was tested, as a plain date string (YYYY-MM-DD). */
    testedOn: varchar("testedOn", { length: 32 }),
    fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
    fileKey: varchar("fileKey", { length: 512 }).notNull(),
    fileName: varchar("fileName", { length: 255 }),
    sizeBytes: bigint("sizeBytes", { mode: "number" }),
    published: boolean("published").default(true).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    productIdx: index("lab_report_product_idx").on(t.productId),
    publishedIdx: index("lab_report_published_idx").on(t.published),
  })
);

export type LabReport = typeof labReports.$inferSelect;
export type InsertLabReport = typeof labReports.$inferInsert;

/**
 * Authentication codes printed under the scratch label on each unit.
 *
 * `verificationCount` is incremented by the verify endpoint itself, in a single
 * conditional UPDATE guarded by `maxVerifications`. Reading the count and then
 * writing it back would let two simultaneous requests both pass the check, which
 * on a code with one check left is exactly the case that matters.
 *
 * Once the allowance is spent the code is reported as invalid to the public: a
 * code that keeps answering "authentic" forever cannot distinguish one genuine
 * label from a thousand photocopies of it.
 */
export const authCodes = mysqlTable(
  "auth_codes",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 128 }).notNull().unique(),
    /** Optional link to the product this code was printed for. */
    productId: int("productId"),
    /** Batch the code belongs to, for recalls and for matching a lab report. */
    batch: varchar("batch", { length: 128 }),
    verificationCount: int("verificationCount").default(0).notNull(),
    maxVerifications: int("maxVerifications").default(3).notNull(),
    /** Admin kill switch: a disabled code verifies as invalid regardless of count. */
    disabled: boolean("disabled").default(false).notNull(),
    firstVerifiedAt: timestamp("firstVerifiedAt"),
    lastVerifiedAt: timestamp("lastVerifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    codeIdx: index("auth_code_idx").on(t.code),
    productIdx: index("auth_code_product_idx").on(t.productId),
  })
);

export type AuthCode = typeof authCodes.$inferSelect;
export type InsertAuthCode = typeof authCodes.$inferInsert;

/**
 * Every verification attempt.
 *
 * `limit_reached` and `disabled` are recorded separately from `not_found` even
 * though the public sees the same answer for all three: a code being checked
 * from twenty addresses after its allowance ran out is the signal that labels
 * are being copied, and it is invisible if every failure logs the same value.
 */
export const queryLogs = mysqlTable(
  "query_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 128 }).notNull(),
    result: mysqlEnum("result", ["valid", "not_found", "limit_reached", "disabled"]).notNull(),
    /** Which check this was for that code (1, 2, 3, 4...), including rejected ones. */
    attemptNumber: int("attemptNumber"),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    codeIdx: index("log_code_idx").on(t.code),
    resultIdx: index("log_result_idx").on(t.result),
    createdIdx: index("log_created_idx").on(t.createdAt),
  })
);

export type QueryLog = typeof queryLogs.$inferSelect;
export type InsertQueryLog = typeof queryLogs.$inferInsert;

/**
 * Key/value store for site-wide copy and toggles (support email, hero text).
 * Deliberately schemaless so adding a field to the admin panel needs no migration.
 */
export const siteSettings = mysqlTable("site_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = typeof siteSettings.$inferInsert;
