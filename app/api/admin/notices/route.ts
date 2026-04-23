import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type NoticeCategory = "latest" | "events" | "updates";
type NewsCategory = { slug: string | null };

const labelByCategory: Record<NoticeCategory, "notice" | "event" | "update"> = {
  latest: "notice",
  events: "event",
  updates: "update",
};

export async function GET() {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("news_posts")
    .select(
      `
      id,
      title,
      content,
      author,
      views,
      published_at,
      game_slug,
      label,
      thumbnail_url,
      show_on_home,
      is_published,
      news_categories (
        slug
      )
    `
    )
    .order("published_at", { ascending: false, nullsFirst: true })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { message: "Failed to fetch notices", error: error.message },
      { status: 500 }
    );
  }

  const notices =
    data?.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      author: item.author,
      views: item.views ?? 0,
      gameSlug: item.game_slug ?? "",
      label: item.label ?? null,
      thumbnailUrl: item.thumbnail_url ?? "",
      showOnHome: Boolean(item.show_on_home),
      isPublished: Boolean(item.is_published),
      category: getCategorySlug(item.news_categories) ?? "latest",
      publishedAt: item.published_at ?? null,
      publishMode: resolvePublishMode(item.is_published, item.published_at),
    })) ?? [];

  return NextResponse.json({ notices });
}

export async function POST(req: NextRequest) {
  let sessionUserEmail = "";

  try {
    const user = await requireAdminSessionUser();
    sessionUserEmail = user.email ?? "";
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
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
  const author = String(body.author ?? sessionUserEmail).trim() || sessionUserEmail;

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
    views: 0,
    published_at: resolvePublishedAt(publishMode, scheduledAt),
    game_slug: gameSlug,
    label: labelByCategory[category],
    thumbnail_url: thumbnailUrl,
    show_on_home: showOnHome,
    is_published: publishMode !== "draft",
  };

  const attempts = [
    { ...payload, category_id: categoryRow.id },
    { ...payload, news_category_id: categoryRow.id },
  ];

  let lastError: { message?: string } | null = null;

  for (const insertPayload of attempts) {
    const { data, error } = await supabaseAdmin
      .from("news_posts")
      .insert(insertPayload)
      .select("id")
      .single();

    if (!error) {
      return NextResponse.json({ id: data.id }, { status: 201 });
    }

    lastError = error;
  }

  return NextResponse.json(
    { message: "Failed to create notice.", error: lastError?.message ?? "Unknown error" },
    { status: 500 }
  );
}

function getCategorySlug(categories: NewsCategory[] | NewsCategory | null) {
  if (!categories) return null;
  return Array.isArray(categories) ? categories[0]?.slug ?? null : categories.slug;
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

function resolvePublishMode(isPublished: boolean | null, publishedAt: string | null) {
  if (!isPublished) return "draft";
  if (publishedAt && new Date(publishedAt).getTime() > Date.now()) return "scheduled";
  return "publish";
}
