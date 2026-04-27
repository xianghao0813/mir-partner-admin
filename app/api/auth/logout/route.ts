import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const requestUrl = new URL(request.url);
  const loginPath = requestUrl.pathname.startsWith("/admin/")
    ? "/admin/login"
    : "/login";

  return NextResponse.redirect(new URL(loginPath, request.url));
}
