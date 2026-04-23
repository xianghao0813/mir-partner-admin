import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("banners")
    .select("id, title, image_url, link_url, game_slug, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json(
      { message: "Failed to fetch public banners.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    banners: data ?? [],
  });
}
