import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import {
  buildUserEventSql,
  getThinkingDataConfig,
  queryThinkingDataSql,
} from "@/lib/thinkingData";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const uid = searchParams.get("uid")?.trim() ?? "";
    const month = searchParams.get("month")?.trim() ?? "";
    const limit = Number(searchParams.get("limit") ?? 100);
    const config = getThinkingDataConfig();

    if (!uid) {
      return NextResponse.json({ message: "UID is required." }, { status: 400 });
    }

    const sql = buildUserEventSql({
      projectId: config.projectId,
      uid,
      month,
      limit: Number.isFinite(limit) ? limit : 100,
    });
    const result = await queryThinkingDataSql({
      sql,
      format: "json_object",
      timeoutSeconds: 15,
    });

    return NextResponse.json({
      success: true,
      projectId: config.projectId,
      appId: config.appId,
      sql,
      headers: result.headers,
      rows: result.rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "ThinkingData query failed.",
      },
      { status: 500 }
    );
  }
}
