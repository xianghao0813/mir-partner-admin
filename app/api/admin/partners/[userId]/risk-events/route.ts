import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await context.params;
  const { data, error } = await supabaseAdmin
    .from("risk_events")
    .select("id,event_type,severity,score,source,details,ip_address,user_agent,resolved_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({ events: [], message: "risk_events table is not initialized." });
    }

    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    events: (data ?? []).map((event) => ({
      id: event.id,
      eventType: event.event_type,
      severity: event.severity,
      score: event.score,
      source: event.source,
      details: event.details,
      ipAddress: event.ip_address,
      userAgent: event.user_agent,
      resolvedAt: event.resolved_at,
      createdAt: event.created_at,
    })),
  });
}
