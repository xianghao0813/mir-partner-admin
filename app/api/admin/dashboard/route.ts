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
    .select("cp_order_no,paid_amount,user_id,paid_at")
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

  const paidOrders = (totalRows ?? []).map((row) => ({
    orderNo: readString(row.cp_order_no),
    userId: readString(row.user_id),
    amount: readNumber(row.paid_amount),
    paidAt: readString(row.paid_at),
  }));
  const paidOrderNos = new Set(paidOrders.map((row) => row.orderNo).filter(Boolean));
  const fallbackWalletRows = await readWalletPaymentFallbacks(paidOrderNos);
  const allRows = [...paidOrders, ...fallbackWalletRows];
  const totalAmount = allRows.reduce((sum, row) => sum + row.amount, 0);
  const todayRows = allRows.filter((row) => {
    const paidAt = row.paidAt;
    return paidAt >= startIso && paidAt < endIso;
  });
  const todayAmount = todayRows.reduce((sum, row) => sum + row.amount, 0);
  const todayPaidUserCount = new Set(todayRows.map((row) => row.userId).filter(Boolean)).size;

  return {
    todayAmount,
    totalAmount,
    todayPaidUserCount,
  };
}

async function readWalletPaymentFallbacks(paidOrderNos: Set<string>) {
  const { data, error } = await supabaseAdmin
    .from("wallet_transactions")
    .select("transaction_key,user_id,amount,occurred_at,created_at")
    .eq("type", "recharge")
    .eq("status", "success")
    .or("transaction_key.like.sdk-order-mp%,transaction_key.like.sdk-order-cp%");

  if (error) {
    if (error.code !== "42P01") {
      console.error("[dashboard wallet payment fallback]", error);
    }
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const transactionKey = readString(row.transaction_key);
      const orderNo = transactionKey.replace(/^sdk-order-/, "");
      return {
        orderNo,
        userId: readString(row.user_id),
        amount: readNumber(row.amount),
        paidAt: readString(row.created_at) || readString(row.occurred_at),
      };
    })
    .filter((row) => row.orderNo && !paidOrderNos.has(row.orderNo) && row.amount > 0 && row.paidAt);
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
