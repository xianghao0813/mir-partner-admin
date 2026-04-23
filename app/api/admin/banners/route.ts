import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("banners")
    .select("id, title, image_url, link_url, game_slug, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json(
      { message: "Failed to fetch banners.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    banners: data ?? [],
  });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const payload = parseBannerPayload(body);

  if ("error" in payload) {
    return NextResponse.json({ message: payload.error }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("banners")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Failed to create banner.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
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
