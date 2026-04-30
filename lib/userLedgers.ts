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
  }
}

function toOccurredAt(date: string | undefined) {
  if (!date) {
    return new Date().toISOString();
  }

  return date.includes("T") ? date : `${date}T00:00:00+08:00`;
}
