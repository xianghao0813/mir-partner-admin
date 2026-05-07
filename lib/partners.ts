import crypto from "node:crypto";
import type { User, UserMetadata } from "@supabase/supabase-js";

export type PartnerTier = {
  id: number;
  label: string;
  minPoints: number;
};

export const MIR_PARTNER_TIERS: PartnerTier[] = [
  { id: 1, label: "米尔新星", minPoints: 0 },
  { id: 2, label: "米尔一星", minPoints: 100000 },
  { id: 3, label: "米尔二星", minPoints: 500000 },
  { id: 4, label: "米尔三星", minPoints: 1000000 },
  { id: 5, label: "米尔四星", minPoints: 5000000 },
  { id: 6, label: "米尔五星", minPoints: 10000000 },
  { id: 7, label: "米尔六星", minPoints: 30000000 },
  { id: 8, label: "米尔至尊", minPoints: 50000000 },
];

export type PartnerRecord = {
  id: string;
  email: string;
  uid: string;
  username: string;
  partnerCode: string;
  partnerNumber: number;
  points: number;
  tier: PartnerTier;
  cloudCoins: number;
  lastSignInAt: string | null;
  createdAt: string | null;
  pointTransactions: LedgerEntry[];
  coinTransactions: LedgerEntry[];
};

export type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  title: string;
  description: string;
  createdAt: string | null;
};

export function buildPartnerRecords(users: User[]) {
  const partners = users
    .filter((user) => readString(user.user_metadata?.quicksdk_uid))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return partners.map((user, index) => buildPartnerRecord(user, index + 1));
}

export function buildPartnerRecord(user: User, partnerNumber: number): PartnerRecord {
  const metadata = user.user_metadata;
  const points = readMirPoints(metadata);

  return {
    id: user.id,
    email: user.email ?? "",
    uid: readString(metadata?.quicksdk_uid),
    username: readString(metadata?.quicksdk_username) || readString(metadata?.username),
    partnerCode: readPartnerCode(metadata, partnerNumber),
    partnerNumber,
    points,
    tier: getCurrentTier(points),
    cloudCoins: readCloudCoins(metadata),
    lastSignInAt: user.last_sign_in_at ?? null,
    createdAt: user.created_at ?? null,
    pointTransactions: readPointTransactions(metadata),
    coinTransactions: readCoinTransactions(metadata),
  };
}

export function filterLedgerByMonth(entries: LedgerEntry[], month: string) {
  if (!month) {
    return entries;
  }

  return entries.filter((entry) => (entry.createdAt ?? "").startsWith(month));
}

export function readPartnerCode(metadata: UserMetadata | undefined, partnerNumber: number) {
  return (
    readValidPartnerCode(metadata?.partner_code) ||
    readValidPartnerCode(metadata?.mir_partner_code) ||
    readValidPartnerCode(metadata?.partnerCode) ||
    createStableFallbackPartnerCode(metadata, partnerNumber)
  );
}

function createStableFallbackPartnerCode(metadata: UserMetadata | undefined, partnerNumber: number) {
  const seed = readString(metadata?.quicksdk_uid) || readString(metadata?.quicksdk_username) || String(partnerNumber);
  const digest = crypto.createHash("sha256").update(`mir-partner:${seed}`, "utf8").digest("hex");
  return `LP${String(parseInt(digest.slice(0, 12), 16) % 1000000).padStart(6, "0")}`;
}

export function getCurrentTier(points: number) {
  return [...MIR_PARTNER_TIERS]
    .reverse()
    .find((tier) => points >= tier.minPoints) ?? MIR_PARTNER_TIERS[0];
}

export function readPartnerPoints(metadata: UserMetadata | undefined) {
  return readMirPoints(metadata);
}

export function appendManualPointAdjustment({
  metadata,
  delta,
  reason,
  adminEmail,
  now = new Date(),
}: {
  metadata: UserMetadata | undefined;
  delta: number;
  reason: string;
  adminEmail: string;
  now?: Date;
}) {
  const beforePoints = readMirPoints(metadata);
  const afterPoints = Math.max(0, beforePoints + delta);
  const beforeTier = getCurrentTier(beforePoints);
  const afterTier = getCurrentTier(afterPoints);
  const monthKey = getShanghaiMonthKey(now);
  const currentMonthlyPoints = readMonthlyPoints(metadata, monthKey);
  const monthlyAdjustmentPoints = Math.max(0, delta);
  const upgradedThisAdjustment = afterTier.id > beforeTier.id;
  const transaction = {
    id: `manual-${now.getTime()}-${Math.abs(delta)}`,
    type: delta >= 0 ? "manual_add" : "manual_deduct",
    source: "admin_manual_adjustment",
    points: delta,
    title: delta >= 0 ? "管理员增加积分" : "管理员扣减积分",
    description: reason || "管理员手动调整",
    adminEmail,
    beforePoints,
    afterPoints,
    createdAt: now.toISOString(),
  };
  const currentTransactions = Array.isArray(metadata?.mir_point_transactions)
    ? metadata.mir_point_transactions
    : [];

  return {
    metadata: {
      ...(metadata ?? {}),
      mir_points: afterPoints,
      mir_month_key: monthKey,
      mir_month_points: currentMonthlyPoints + monthlyAdjustmentPoints,
      mir_last_tier_id: afterTier.id,
      mir_upgraded_month_key:
        upgradedThisAdjustment
          ? monthKey
          : readString(metadata?.mir_upgraded_month_key) || undefined,
      mir_last_point_source: "admin_manual_adjustment",
      mir_last_point_award: delta,
      mir_last_point_awarded_at: now.toISOString(),
      mir_point_transactions: [transaction, ...currentTransactions].slice(0, 500),
    },
    beforePoints,
    afterPoints,
    pointTransaction: transaction,
  };
}

export function appendAdminTestRechargeOrder({
  metadata,
  amount,
  orderNo,
  adminEmail,
  remark,
  now = new Date(),
}: {
  metadata: UserMetadata | undefined;
  amount: number;
  orderNo: string;
  adminEmail: string;
  remark: string;
  now?: Date;
}) {
  const rechargeAmount = Math.max(0, Math.floor(amount));
  const awardedPoints = rechargeAmount * 100;
  const beforePoints = readMirPoints(metadata);
  const afterPoints = beforePoints + awardedPoints;
  const beforeCoins = readCloudCoins(metadata);
  const afterCoins = beforeCoins + rechargeAmount;
  const beforeTier = getCurrentTier(beforePoints);
  const afterTier = getCurrentTier(afterPoints);
  const monthKey = getShanghaiMonthKey(now);
  const currentMonthlyPoints = readMonthlyPoints(metadata, monthKey);
  const createdAt = now.toISOString();

  const pointTransaction = {
    id: `test-point-${orderNo}`,
    type: "earn",
    source: "admin_test_recharge",
    points: awardedPoints,
    title: "测试订单积分",
    description: `${remark || "管理员测试订单"} / 订单号：${orderNo}`,
    adminEmail,
    beforePoints,
    afterPoints,
    createdAt,
  };
  const walletTransaction = {
    id: `sdk-order-${orderNo}`,
    type: "recharge",
    amount: rechargeAmount,
    coins: rechargeAmount,
    desc: `${remark || "管理员测试订单"} / ${orderNo}`,
    date: createdAt.slice(0, 10),
    payMethod: "",
    status: "success",
    adminEmail,
    createdAt,
  };
  const currentPointTransactions = Array.isArray(metadata?.mir_point_transactions)
    ? metadata.mir_point_transactions
    : [];
  const currentWalletTransactions = Array.isArray(metadata?.wallet_transactions)
    ? metadata.wallet_transactions
    : [];

  return {
    metadata: {
      ...(metadata ?? {}),
      cloud_coins: afterCoins,
      wallet_last_order_no: orderNo,
      wallet_transactions: [walletTransaction, ...currentWalletTransactions].slice(0, 500),
      mir_points: afterPoints,
      mir_month_key: monthKey,
      mir_month_points: currentMonthlyPoints + awardedPoints,
      mir_last_tier_id: afterTier.id,
      mir_upgraded_month_key:
        afterTier.id > beforeTier.id
          ? monthKey
          : readString(metadata?.mir_upgraded_month_key) || undefined,
      mir_last_point_source: "admin_test_recharge",
      mir_last_point_award: awardedPoints,
      mir_last_point_awarded_at: createdAt,
      mir_point_transactions: [pointTransaction, ...currentPointTransactions].slice(0, 500),
    },
    beforePoints,
    afterPoints,
    awardedPoints,
    beforeCoins,
    afterCoins,
    orderNo,
    pointTransaction,
    walletTransaction,
  };
}

export function appendAdminCouponTestOrder({
  metadata,
  orderNo,
  adminEmail,
  remark,
  originalAmount,
  paidAmount,
  coins,
  couponCode,
  now = new Date(),
}: {
  metadata: UserMetadata | undefined;
  orderNo: string;
  adminEmail: string;
  remark: string;
  originalAmount: number;
  paidAmount: number;
  coins: number;
  couponCode: string;
  now?: Date;
}) {
  const awardedPoints = Math.max(0, Math.floor(paidAmount * 100));
  const beforePoints = readMirPoints(metadata);
  const afterPoints = beforePoints + awardedPoints;
  const beforeCoins = readCloudCoins(metadata);
  const afterCoins = beforeCoins + Math.max(0, Math.floor(coins));
  const beforeTier = getCurrentTier(beforePoints);
  const afterTier = getCurrentTier(afterPoints);
  const monthKey = getShanghaiMonthKey(now);
  const currentMonthlyPoints = readMonthlyPoints(metadata, monthKey);
  const createdAt = now.toISOString();

  const pointTransaction = {
    id: `coupon-test-point-${orderNo}`,
    type: "earn",
    source: "admin_coupon_test_order",
    points: awardedPoints,
    title: "优惠券测试订单积分",
    description: `${remark || "管理员优惠券测试订单"} / 券码：${couponCode} / 原价：${originalAmount} / 实付：${paidAmount}`,
    adminEmail,
    beforePoints,
    afterPoints,
    createdAt,
  };
  const walletTransaction = {
    id: `sdk-order-${orderNo}`,
    type: "recharge",
    amount: paidAmount,
    coins: Math.max(0, Math.floor(coins)),
    desc: `${remark || "管理员优惠券测试订单"} / 券码：${couponCode} / ${orderNo}`,
    date: createdAt.slice(0, 10),
    payMethod: "",
    status: "success",
    adminEmail,
    createdAt,
  };
  const currentPointTransactions = Array.isArray(metadata?.mir_point_transactions)
    ? metadata.mir_point_transactions
    : [];
  const currentWalletTransactions = Array.isArray(metadata?.wallet_transactions)
    ? metadata.wallet_transactions
    : [];

  return {
    metadata: {
      ...(metadata ?? {}),
      cloud_coins: afterCoins,
      wallet_last_order_no: orderNo,
      wallet_transactions: [walletTransaction, ...currentWalletTransactions].slice(0, 500),
      mir_points: afterPoints,
      mir_month_key: monthKey,
      mir_month_points: currentMonthlyPoints + awardedPoints,
      mir_last_tier_id: afterTier.id,
      mir_upgraded_month_key:
        afterTier.id > beforeTier.id
          ? monthKey
          : readString(metadata?.mir_upgraded_month_key) || undefined,
      mir_last_point_source: "admin_coupon_test_order",
      mir_last_point_award: awardedPoints,
      mir_last_point_awarded_at: createdAt,
      mir_point_transactions: [pointTransaction, ...currentPointTransactions].slice(0, 500),
    },
    beforePoints,
    afterPoints,
    awardedPoints,
    beforeCoins,
    afterCoins,
    orderNo,
    pointTransaction,
    walletTransaction,
  };
}

function readMirPoints(metadata: UserMetadata | undefined) {
  return readNumberFromKeys(metadata, ["mir_points", "partner_points", "total_points", "points"]);
}

function readCloudCoins(metadata: UserMetadata | undefined) {
  return readNumberFromKeys(metadata, ["cloud_coins", "wallet_coins", "coins"]);
}

function readPointTransactions(metadata: UserMetadata | undefined): LedgerEntry[] {
  const raw = Array.isArray(metadata?.mir_point_transactions) ? metadata?.mir_point_transactions : [];
  const entries = raw.map((item, index) => normalizeLedgerEntry(item, index, "point"));

  if (entries.length > 0) {
    return entries;
  }

  const lastAward = readNumber(metadata?.mir_last_point_award);
  const lastAwardedAt = readString(metadata?.mir_last_point_awarded_at);

  if (lastAward > 0 || lastAwardedAt) {
    return [
      {
        id: "last-point-award",
        type: readString(metadata?.mir_last_point_source) || "point",
        amount: lastAward,
        title: "积分变动",
        description: readString(metadata?.mir_last_point_source) || "最近一次积分记录",
        createdAt: lastAwardedAt || null,
      },
    ];
  }

  return [];
}

function readCoinTransactions(metadata: UserMetadata | undefined): LedgerEntry[] {
  const raw = Array.isArray(metadata?.wallet_transactions) ? metadata?.wallet_transactions : [];
  return raw.map((item, index) => normalizeLedgerEntry(item, index, "coin"));
}

function normalizeLedgerEntry(item: unknown, index: number, fallbackType: string): LedgerEntry {
  const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const amount =
    readNumber(source.points) ||
    readNumber(source.coins) ||
    readNumber(source.amount) ||
    readNumber(source.value);

  return {
    id: readString(source.id) || `${fallbackType}-${index}`,
    type: readString(source.type) || readString(source.source) || fallbackType,
    amount,
    title: readString(source.title) || (fallbackType === "point" ? "积分记录" : "云币记录"),
    description:
      readString(source.description) ||
      readString(source.orderNo) ||
      readString(source.source) ||
      "-",
    createdAt: readIsoString(source.createdAt) || readIsoString(source.created_at),
  };
}

function readNumberFromKeys(metadata: UserMetadata | undefined, keys: string[]) {
  for (const key of keys) {
    const value = readNumber(metadata?.[key]);
    if (value > 0) {
      return value;
    }
  }

  return 0;
}

function readMonthlyPoints(metadata: UserMetadata | undefined, monthKey: string) {
  return readString(metadata?.mir_month_key) === monthKey ? readNumber(metadata?.mir_month_points) : 0;
}

function getShanghaiMonthKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(now);
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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readValidPartnerCode(value: unknown) {
  const raw = readString(value).toUpperCase();
  return /^LP\d{6}$/.test(raw) ? raw : "";
}

function readIsoString(value: unknown) {
  const raw = readString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}
