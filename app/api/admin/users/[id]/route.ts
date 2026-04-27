import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_ACCESS_LEVEL = 3;
const DEFAULT_ROLE_GROUP = "content_manager";
const DEFAULT_STATUS = "active";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await req.json();

  const roleGroup = normalizeRoleGroup(body.roleGroup);
  const accessLevel = normalizeAccessLevel(body.accessLevel);
  const status = normalizeStatus(body.status);

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    app_metadata: {
      role_group: roleGroup,
      access_level: accessLevel,
    },
    user_metadata: {
      status,
    },
  });

  if (error) {
    return NextResponse.json(
      { message: "Failed to update admin account", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email ?? "",
      roleGroup,
      accessLevel,
      status,
    },
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await req.json();
  const action = String(body.action ?? "").trim();

  if (action === "reset_password") {
    const temporaryPassword = String(body.temporaryPassword ?? "").trim();

    if (temporaryPassword.length < 8) {
      return NextResponse.json(
        { message: "Temporary password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: temporaryPassword,
    });

    if (error) {
      return NextResponse.json(
        { message: "Failed to reset password", error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  }

  if (action === "force_logout") {
    const { data: currentUserData, error: fetchError } =
      await supabaseAdmin.auth.admin.getUserById(id);

    if (fetchError || !currentUserData.user) {
      return NextResponse.json(
        { message: "Failed to resolve admin account", error: fetchError?.message },
        { status: 500 }
      );
    }

    const existingMetadata =
      currentUserData.user.app_metadata && typeof currentUserData.user.app_metadata === "object"
        ? currentUserData.user.app_metadata
        : {};

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      app_metadata: {
        ...existingMetadata,
        force_logout_at: new Date().toISOString(),
      },
    });

    if (error) {
      return NextResponse.json(
        { message: "Failed to force logout", error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ message: "Unsupported action" }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let adminUser;

  try {
    adminUser = await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (getRoleGroup(adminUser.app_metadata) !== "super_admin") {
    return NextResponse.json(
      { message: "Only Super Admin can delete admin accounts." },
      { status: 403 }
    );
  }

  const { id } = await context.params;

  if (id === adminUser.id) {
    return NextResponse.json(
      { message: "You cannot delete your own admin account." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

  if (error) {
    return NextResponse.json(
      { message: "Failed to delete admin account", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

function normalizeRoleGroup(value: unknown) {
  const raw = String(value ?? DEFAULT_ROLE_GROUP).trim();
  const allowed = new Set(["super_admin", "ops_manager", "content_manager", "analyst"]);
  return allowed.has(raw) ? raw : DEFAULT_ROLE_GROUP;
}

function getRoleGroup(appMetadata: unknown) {
  if (!appMetadata || typeof appMetadata !== "object") return DEFAULT_ROLE_GROUP;
  const value = (appMetadata as Record<string, unknown>).role_group;
  return normalizeRoleGroup(value);
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
