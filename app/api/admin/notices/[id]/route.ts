import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type NoticeCategory = "latest" | "events" | "updates";

const labelByCategory: Record<NoticeCategory, "notice" | "event" | "update"> = {
  latest: "notice",
  events: "event",
  updates: "update",
};

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
  const postId = Number(id);

  if (!Number.isFinite(postId)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const body = await req.json();
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  const category = body.category as NoticeCategory;
  const gameSlug = String(body.gameSlug ?? "").trim() || null;
  const thumbnailUrl = String(body.thumbnailUrl ?? "").trim() || null;
  const showOnHome = Boolean(body.showOnHome);
  const publishMode = normalizePublishMode(body.publishMode);
  const scheduledAt = normalizeScheduledAt(body.scheduledAt);
  const author = String(body.author ?? "").trim();

  if (!title || !content || !category || !(category in labelByCategory)) {
    return NextResponse.json(
      { message: "Title, content, and category are required." },
      { status: 400 }
    );
  }

  const { data: categoryRow, error: categoryError } = await supabaseAdmin
    .from("news_categories")
    .select("id, slug")
    .eq("slug", category)
    .single();

  if (categoryError || !categoryRow) {
    return NextResponse.json(
      { message: "Failed to resolve news category.", error: categoryError?.message },
      { status: 500 }
    );
  }

  const payload = {
    title,
    content,
    author,
    game_slug: gameSlug,
    label: labelByCategory[category],
    thumbnail_url: thumbnailUrl,
    show_on_home: showOnHome,
    is_published: publishMode !== "draft",
    published_at: resolvePublishedAt(publishMode, scheduledAt),
  };

  const attempts = [
    { ...payload, category_id: categoryRow.id },
    { ...payload, news_category_id: categoryRow.id },
  ];

  let lastError: { message?: string } | null = null;

  for (const updatePayload of attempts) {
    const { error } = await supabaseAdmin
      .from("news_posts")
      .update(updatePayload)
      .eq("id", postId);

    if (!error) {
      return NextResponse.json({ success: true });
    }

    lastError = error;
  }

  return NextResponse.json(
    { message: "Failed to update notice.", error: lastError?.message ?? "Unknown error" },
    { status: 500 }
  );
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
  const postId = Number(id);

  if (!Number.isFinite(postId)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("news_posts").delete().eq("id", postId);

  if (error) {
    return NextResponse.json(
      { message: "Failed to delete notice.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

function normalizePublishMode(value: unknown) {
  const raw = String(value ?? "publish").trim();
  const allowed = new Set(["draft", "publish", "scheduled"]);
  return allowed.has(raw) ? raw : "publish";
}

function normalizeScheduledAt(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function resolvePublishedAt(mode: string, scheduledAt: string | null) {
  if (mode === "draft") return null;
  if (mode === "scheduled") return scheduledAt;
  return new Date().toISOString();
}
