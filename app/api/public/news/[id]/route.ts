import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type NewsCategory = { slug: string | null };

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const postId = Number(id);

  if (!Number.isFinite(postId)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
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
      thumbnail_url,
      game_slug,
      label,
      show_on_home,
      news_categories (
        slug
      )
    `
    )
    .eq("id", postId)
    .eq("is_published", true)
    .lte("published_at", new Date().toISOString())
    .single();

  if (error || !data) {
    return NextResponse.json({ message: "News not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    title: data.title,
    content: data.content,
    author: data.author,
    views: data.views,
    publishedAt: data.published_at,
    thumbnailUrl: data.thumbnail_url,
    gameSlug: data.game_slug,
    label: data.label,
    showOnHome: data.show_on_home,
    category: getCategorySlug(data.news_categories) ?? "latest",
  });
}

function getCategorySlug(categories: NewsCategory[] | NewsCategory | null) {
  if (!categories) return null;
  return Array.isArray(categories) ? categories[0]?.slug ?? null : categories.slug;
}
