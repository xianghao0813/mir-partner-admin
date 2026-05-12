import { NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { startIso, endIso } = getShanghaiDayRange();
  const { users, error } = await listAllUsers();

  if (error) {
    return NextResponse.json(
      { message: "Failed to fetch partner users", error },
      { status: 500 }
    );
  }

  const partners = users.filter((user) => readString(user.user_metadata?.quicksdk_uid));
  const todayActivePartners = partners.filter((user) => {
    const lastSignInAt = readString(user.last_sign_in_at);
    return lastSignInAt >= startIso && lastSignInAt < endIso;
  });
  const paymentStats = await readPaymentStats(startIso, endIso);
  const paymentRate = todayActivePartners.length > 0
    ? paymentStats.todayPaidUserCount / todayActivePartners.length
    : 0;

  return NextResponse.json({
    partnerCount: partners.length,
    todayRechargeAmount: paymentStats.todayAmount,
    totalRechargeAmount: paymentStats.totalAmount,
    todayActiveUsers: todayActivePartners.length,
    todayPaidUsers: paymentStats.todayPaidUserCount,
    paymentRate,
    range: {
      timezone: "Asia/Shanghai",
      startIso,
      endIso,
    },
  });
}

async function listAllUsers() {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return { users: [], error: error.message };
    }

    users.push(...data.users);
    if (data.users.length < perPage) {
      return { users, error: "" };
    }

    page += 1;
  }
}

async function readPaymentStats(startIso: string, endIso: string) {
  const { data: totalRows, error: totalError } = await supabaseAdmin
    .from("payment_orders")
    .select("paid_amount,user_id,paid_at")
    .eq("status", "paid");

  if (totalError) {
    if (totalError.code !== "42P01") {
      console.error("[dashboard payment total]", totalError);
    }
    return {
      todayAmount: 0,
      totalAmount: 0,
      todayPaidUserCount: 0,
    };
  }

  const totalAmount = (totalRows ?? []).reduce((sum, row) => sum + readNumber(row.paid_amount), 0);
  const todayRows = (totalRows ?? []).filter((row) => {
    const paidAt = readString(row.paid_at);
    return paidAt >= startIso && paidAt < endIso;
  });
  const todayAmount = todayRows.reduce((sum, row) => sum + readNumber(row.paid_amount), 0);
  const todayPaidUserCount = new Set(todayRows.map((row) => readString(row.user_id)).filter(Boolean)).size;

  return {
    todayAmount,
    totalAmount,
    todayPaidUserCount,
  };
}

function getShanghaiDayRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? now.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? now.getUTCMonth() + 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? now.getUTCDate());
  const start = new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
