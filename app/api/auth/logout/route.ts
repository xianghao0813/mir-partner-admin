import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminPath } from "@/lib/paths";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL(adminPath("/login"), request.url));
}
