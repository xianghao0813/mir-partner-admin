import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/supabase/clear-auth-cookies";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  clearAuthCookies(response);
  return response;
}

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
