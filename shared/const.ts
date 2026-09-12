export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

/** Admin session cookie (independent from Manus OAuth). */
export const ADMIN_COOKIE_NAME = "verify_admin_session";
export const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Brand-facing strings. Everything the visitor reads that isn't managed from the
 * admin panel lives here, so renaming the site is one edit rather than a grep.
 */
export const BRAND_NAME = "ACTIVE";
export const BRAND_DOMAIN = "activebrand.com";
export const SUPPORT_EMAIL = "support@activebrand.com";

/** Default number of times a single code may be verified before it stops working. */
export const DEFAULT_MAX_VERIFICATIONS = 3;
