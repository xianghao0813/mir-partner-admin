import { createClient } from "@/lib/supabase/server";

const ALLOWED_STATUSES = new Set(["active", "readonly"]);
const ADMIN_ROLE_GROUPS = new Set(["super_admin", "ops_manager", "content_manager", "analyst"]);

export async function getAdminSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  if (!isAdminAccount(user.app_metadata, user.user_metadata)) {
    return null;
  }

  const status = normalizeStatus(user.user_metadata);

  if (!ALLOWED_STATUSES.has(status)) {
    return null;
  }

  const forceLogoutAt = readIsoDate(user.app_metadata, "force_logout_at");
  const lastSignInAt = user.last_sign_in_at ?? null;

  if (forceLogoutAt && isForcedLogoutRequired(forceLogoutAt, lastSignInAt)) {
    return null;
  }

  return user;
}

export async function requireAdminSessionUser() {
  const user = await getAdminSessionUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

function normalizeStatus(userMetadata: unknown) {
  if (!userMetadata || typeof userMetadata !== "object") {
    return "active";
  }

  const value = (userMetadata as Record<string, unknown>).status;
  const raw = String(value ?? "active").trim();
  const allowed = new Set(["active", "suspended", "readonly"]);
  return allowed.has(raw) ? raw : "active";
}

export function isAdminAccount(appMetadata: unknown, userMetadata?: unknown) {
  const app = isRecord(appMetadata) ? appMetadata : {};
  const user = isRecord(userMetadata) ? userMetadata : {};
  const roleGroup = String(app.role_group ?? user.role_group ?? "").trim();
  const accountType = String(app.account_type ?? user.account_type ?? "").trim();
  const isAdmin = app.is_admin === true || user.is_admin === true;

  return accountType === "admin" || isAdmin || ADMIN_ROLE_GROUPS.has(roleGroup);
}

export function normalizeAdminRoleGroup(appMetadata: unknown, userMetadata?: unknown) {
  const app = isRecord(appMetadata) ? appMetadata : {};
  const user = isRecord(userMetadata) ? userMetadata : {};
  const raw = String(app.role_group ?? user.role_group ?? "").trim();
  return ADMIN_ROLE_GROUPS.has(raw) ? raw : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readIsoDate(source: unknown, key: string) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isForcedLogoutRequired(forceLogoutAt: string, lastSignInAt: string | null) {
  const forceTs = new Date(forceLogoutAt).getTime();

  if (!Number.isFinite(forceTs)) {
    return false;
  }

  if (!lastSignInAt) {
    return true;
  }

  const signInTs = new Date(lastSignInAt).getTime();

  if (!Number.isFinite(signInTs)) {
    return true;
  }

  return forceTs >= signInTs;
}
