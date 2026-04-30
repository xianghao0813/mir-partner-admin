import { supabaseAdmin } from "@/lib/supabaseAdmin";

type WalletLedgerInput = {
  id: string;
  type: string;
  amount: number;
  coins: number;
  desc?: string;
  date?: string;
  payMethod?: string;
  status?: string;
  createdAt?: string;
};

type PointLedgerInput = {
  id: string;
  type?: string;
  source?: string;
  points: number;
  title?: string;
  description?: string;
  createdAt?: string;
};

export type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  title: string;
  description: string;
  createdAt: string | null;
};

export async function insertWalletTransaction(userId: string, transaction: WalletLedgerInput) {
  const { error } = await supabaseAdmin.from("wallet_transactions").upsert(
    {
      user_id: userId,
      transaction_key: transaction.id,
      type: transaction.type === "consume" ? "consume" : "recharge",
      amount: transaction.amount,
      coins: transaction.coins,
      description: transaction.desc ?? "-",
      pay_method: transaction.payMethod || null,
      status: transaction.status || "success",
      occurred_at: transaction.createdAt ?? toOccurredAt(transaction.date),
    },
    { onConflict: "transaction_key", ignoreDuplicates: true }
  );

  if (error) {
    console.error("[wallet_transactions insert]", error);
    throw new Error(`wallet_transactions insert failed: ${error.message}`);
  }
}

export async function insertPointTransaction(userId: string, transaction: PointLedgerInput) {
  if (!transaction.points) {
    return;
  }

  const { error } = await supabaseAdmin.from("mir_point_transactions").upsert(
    {
      user_id: userId,
      transaction_key: transaction.id,
      type: transaction.points < 0 ? "deduct" : "earn",
      source: transaction.source || transaction.type || "admin",
      reference_id: null,
      points: transaction.points,
      title: transaction.title || "MIR 积分",
      description: transaction.description || "-",
      occurred_at: transaction.createdAt ?? new Date().toISOString(),
    },
    { onConflict: "transaction_key", ignoreDuplicates: true }
  );

  if (error) {
    console.error("[mir_point_transactions insert]", error);
    throw new Error(`mir_point_transactions insert failed: ${error.message}`);
  }
}

export async function readWalletTransactionsFromDb(userId: string, month?: string): Promise<LedgerEntry[]> {
  let query = supabaseAdmin
    .from("wallet_transactions")
    .select("transaction_key,type,amount,coins,description,occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(300);

  if (month) {
    query = query.gte("occurred_at", `${month}-01T00:00:00+08:00`).lt("occurred_at", getNextMonthStart(month));
  }

  const { data, error } = await query;

  if (error) {
    console.error("[wallet_transactions read]", error);
    return [];
  }

  return (data ?? []).map((item) => ({
    id: readString(item.transaction_key),
    type: readString(item.type) || "coin",
    amount: readNumber(item.coins) || readNumber(item.amount),
    title: "云币记录",
    description: readString(item.description) || "-",
    createdAt: readString(item.occurred_at) || null,
  }));
}

export async function readPointTransactionsFromDb(userId: string, month?: string): Promise<LedgerEntry[]> {
  let query = supabaseAdmin
    .from("mir_point_transactions")
    .select("transaction_key,type,title,description,points,source,occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(300);

  if (month) {
    query = query.gte("occurred_at", `${month}-01T00:00:00+08:00`).lt("occurred_at", getNextMonthStart(month));
  }

  const { data, error } = await query;

  if (error) {
    console.error("[mir_point_transactions read]", error);
    return [];
  }

  return (data ?? []).map((item) => ({
    id: readString(item.transaction_key),
    type: readString(item.source) || readString(item.type) || "point",
    amount: readNumber(item.points),
    title: readString(item.title) || "MIR 积分",
    description: readString(item.description) || "-",
    createdAt: readString(item.occurred_at) || null,
  }));
}

function toOccurredAt(date: string | undefined) {
  if (!date) {
    return new Date().toISOString();
  }

  return date.includes("T") ? date : `${date}T00:00:00+08:00`;
}

function getNextMonthStart(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) {
    return new Date().toISOString();
  }

  const next = monthIndex === 12 ? new Date(Date.UTC(year, 12, 1)) : new Date(Date.UTC(year, monthIndex, 1));
  return next.toISOString();
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }

  return 0;
}
