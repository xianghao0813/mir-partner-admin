import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_ACCESS_LEVEL = 3;
const DEFAULT_ROLE_GROUP = "content_manager";
const DEFAULT_STATUS = "active";

export async function GET() {
  let adminUser;
  try {
    adminUser = await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    return NextResponse.json(
      { message: "Failed to fetch admin users", error: error.message },
      { status: 500 }
    );
  }

  const users =
    data?.users.map((item) => ({
      id: item.id,
      email: item.email ?? "",
      createdAt: item.created_at ?? null,
      lastSignInAt: item.last_sign_in_at ?? null,
      emailConfirmedAt: item.email_confirmed_at ?? null,
      role: item.role ?? null,
      roleGroup: getRoleGroup(item.app_metadata),
      accessLevel: getAccessLevel(item.app_metadata),
      status: getStatus(item.user_metadata),
      forceLogoutAt: getForceLogoutAt(item.app_metadata),
    })) ?? [];

  return NextResponse.json({
    users,
    currentAdmin: {
      id: adminUser.id,
      roleGroup: getRoleGroup(adminUser.app_metadata),
    },
  });
}

export async function POST(req: NextRequest) {
  let adminUser;
  try {
    adminUser = await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (getRoleGroup(adminUser.app_metadata) !== "super_admin") {
    return NextResponse.json(
      { message: "Only Super Admin can create admin accounts." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "").trim();
  const roleGroup = normalizeRoleGroup(body.roleGroup);
  const accessLevel = normalizeAccessLevel(body.accessLevel);
  const status = normalizeStatus(body.status);

  if (!email || !password) {
    return NextResponse.json(
      { message: "Email and password are required." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { message: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      role_group: roleGroup,
      access_level: accessLevel,
      force_logout_at: null,
    },
    user_metadata: {
      status,
    },
  });

  if (error) {
    return NextResponse.json(
      { message: "Failed to create admin account", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      user: {
        id: data.user.id,
        email: data.user.email ?? "",
        roleGroup,
        accessLevel,
        status,
        forceLogoutAt: null,
      },
    },
    { status: 201 }
  );
}

function getRoleGroup(appMetadata: unknown) {
  if (!appMetadata || typeof appMetadata !== "object") return DEFAULT_ROLE_GROUP;
  const value = (appMetadata as Record<string, unknown>).role_group;
  return normalizeRoleGroup(value);
}

function getAccessLevel(appMetadata: unknown) {
  if (!appMetadata || typeof appMetadata !== "object") return DEFAULT_ACCESS_LEVEL;
  const value = (appMetadata as Record<string, unknown>).access_level;
  return normalizeAccessLevel(value);
}

function getForceLogoutAt(appMetadata: unknown) {
  if (!appMetadata || typeof appMetadata !== "object") return null;
  const value = (appMetadata as Record<string, unknown>).force_logout_at;
  return normalizeIsoDate(value);
}

function getStatus(userMetadata: unknown) {
  if (!userMetadata || typeof userMetadata !== "object") return DEFAULT_STATUS;
  const value = (userMetadata as Record<string, unknown>).status;
  return normalizeStatus(value);
}

function normalizeRoleGroup(value: unknown) {
  const raw = String(value ?? DEFAULT_ROLE_GROUP).trim();
  const allowed = new Set(["super_admin", "ops_manager", "content_manager", "analyst"]);
  return allowed.has(raw) ? raw : DEFAULT_ROLE_GROUP;
}

function normalizeAccessLevel(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_ACCESS_LEVEL;
  return Math.min(5, Math.max(1, Math.trunc(parsed)));
}

function normalizeStatus(value: unknown) {
  const raw = String(value ?? DEFAULT_STATUS).trim();
  const allowed = new Set(["active", "suspended", "readonly"]);
  return allowed.has(raw) ? raw : DEFAULT_STATUS;
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
