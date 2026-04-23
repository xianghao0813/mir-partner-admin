import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  const bannerId = Number(id);

  if (!Number.isFinite(bannerId)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const body = await req.json();
  const payload = parseBannerPayload(body);

  if ("error" in payload) {
    return NextResponse.json({ message: payload.error }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("banners").update(payload).eq("id", bannerId);

  if (error) {
    return NextResponse.json(
      { message: "Failed to update banner.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const bannerId = Number(id);

  if (!Number.isFinite(bannerId)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("banners").delete().eq("id", bannerId);

  if (error) {
    return NextResponse.json(
      { message: "Failed to delete banner.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

function parseBannerPayload(body: unknown) {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const title = String(source.title ?? "").trim() || null;
  const imageUrl = String(source.imageUrl ?? "").trim();
  const linkUrl = String(source.linkUrl ?? "").trim() || null;
  const gameSlug = String(source.gameSlug ?? "").trim() || null;
  const sortOrder = Number(source.sortOrder ?? 0);
  const isActive = Boolean(source.isActive);

  if (!imageUrl) {
    return { error: "Image URL is required." };
  }

  if (!Number.isFinite(sortOrder)) {
    return { error: "Sort order must be a valid number." };
  }

  return {
    title,
    image_url: imageUrl,
    link_url: linkUrl,
    game_slug: gameSlug,
    sort_order: sortOrder,
    is_active: isActive,
  };
}
