import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type NewsCategory = { slug: string | null };
const PAGE_SIZE = 10;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const page = Math.max(Number(searchParams.get("page") ?? "1"), 1);
  const keyword = (searchParams.get("keyword") ?? "").trim();
  const searchType = searchParams.get("searchType") ?? "title_content";
  const featuredOnly = searchParams.get("featured") === "1";
  const limit = Math.max(Number(searchParams.get("limit") ?? (featuredOnly ? "4" : String(PAGE_SIZE))), 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
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
      news_categories!inner (
        slug
      )
    `,
      { count: "exact" }
    )
    .eq("is_published", true)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });

  if (featuredOnly) {
    query = query.eq("show_on_home", true);
  }

  if (category) {
    query = query.eq("news_categories.slug", category);
  }

  if (keyword) {
    if (searchType === "author") {
      query = query.ilike("author", `%${keyword}%`);
    } else {
      query = query.or(`title.ilike.%${keyword}%,content.ilike.%${keyword}%`);
    }
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json(
      { message: "Failed to fetch public news", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    items:
      data?.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        author: item.author,
        views: item.views,
        publishedAt: item.published_at,
        thumbnailUrl: item.thumbnail_url,
        gameSlug: item.game_slug,
        label: item.label,
        showOnHome: item.show_on_home,
        category: getCategorySlug(item.news_categories) ?? "latest",
      })) ?? [],
    pagination: {
      page,
      pageSize: limit,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
    },
  });
}

function getCategorySlug(categories: NewsCategory[] | NewsCategory | null) {
  if (!categories) return null;
  return Array.isArray(categories) ? categories[0]?.slug ?? null : categories.slug;
}
