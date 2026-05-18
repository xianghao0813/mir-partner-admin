import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import {
  applyImportedPointBaseline,
  appendAdminTestRechargeOrder,
  appendManualPointAdjustment,
  buildPartnerRecords,
  filterLedgerByMonth,
} from "@/lib/partners";
import { changeQuickSdkPlatformCoins } from "@/lib/quicksdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  insertPointTransaction,
  insertWalletTransaction,
  readPointTransactionsFromDb,
  readWalletTransactionsFromDb,
} from "@/lib/userLedgers";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const month = searchParams.get("month")?.trim() ?? "";

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    return NextResponse.json(
      { message: "Failed to fetch partners", error: error.message },
      { status: 500 }
    );
  }

  const partners = buildPartnerRecords(data.users);
  const filtered = query
    ? partners.filter((partner) =>
        [
          partner.uid,
          partner.partnerCode,
          partner.username,
          partner.email,
          String(partner.partnerNumber),
        ].some((value) => value.toLowerCase().includes(query))
      )
    : partners;
  const rechargeTotals = await readPartnerRechargeTotals(filtered.map((partner) => partner.id));

  const partnersWithDbLedgers = await Promise.all(
    filtered.map(async (partner) => {
      const [pointTransactions, coinTransactions] = await Promise.all([
        readPointTransactionsFromDb(partner.id, month),
        readWalletTransactionsFromDb(partner.id, month),
      ]);
      const rawPointTransactions = pointTransactions.length > 0
        ? pointTransactions
        : filterLedgerByMonth(partner.pointTransactions, month);

      return {
        ...partner,
        totalRechargeAmount: rechargeTotals.get(partner.id) ?? 0,
        pointTransactions: filterImportedPointLedgers(rawPointTransactions, partner.importMode, partner.importBaselineAt),
        coinTransactions: coinTransactions.length > 0
          ? coinTransactions
          : filterLedgerByMonth(partner.coinTransactions, month),
      };
    })
  );

  return NextResponse.json({
    totalPartners: partners.length,
    partners: partnersWithDbLedgers,
  });
}

async function readPartnerRechargeTotals(userIds: string[]) {
  const totals = new Map<string, number>();
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    return totals;
  }

  const { data: paidOrders, error: paidOrdersError } = await supabaseAdmin
    .from("payment_orders")
    .select("cp_order_no,user_id,paid_amount")
    .eq("status", "paid")
    .in("user_id", uniqueUserIds);

  const paidOrderNos = new Set<string>();
  if (paidOrdersError) {
    if (paidOrdersError.code !== "42P01") {
      console.error("[partners recharge totals payment_orders]", paidOrdersError);
    }
  } else {
    for (const row of paidOrders ?? []) {
      const userId = readString(row.user_id);
      const orderNo = readString(row.cp_order_no);
      const amount = readNumber(row.paid_amount);
      if (userId && amount > 0) {
        totals.set(userId, (totals.get(userId) ?? 0) + amount);
      }
      if (orderNo) {
        paidOrderNos.add(orderNo);
      }
    }
  }

  const { data: walletRows, error: walletRowsError } = await supabaseAdmin
    .from("wallet_transactions")
    .select("transaction_key,user_id,amount")
    .eq("type", "recharge")
    .eq("status", "success")
    .in("user_id", uniqueUserIds)
    .or("transaction_key.like.sdk-order-mp%,transaction_key.like.sdk-order-cp%");

  if (walletRowsError) {
    if (walletRowsError.code !== "42P01") {
      console.error("[partners recharge totals wallet_transactions]", walletRowsError);
    }
    return totals;
  }

  for (const row of walletRows ?? []) {
    const transactionKey = readString(row.transaction_key);
    const orderNo = transactionKey.replace(/^sdk-order-/, "");
    const userId = readString(row.user_id);
    const amount = readNumber(row.amount);
    if (userId && orderNo && !paidOrderNos.has(orderNo) && amount > 0) {
      totals.set(userId, (totals.get(userId) ?? 0) + amount);
    }
  }

  return totals;
}

function filterImportedPointLedgers<T extends { createdAt: string | null; type?: string }>(
  entries: T[],
  importMode: string,
  importBaselineAt: string | null
) {
  if (importMode !== "override" || !importBaselineAt) {
    return entries;
  }

  const baselineTime = new Date(importBaselineAt).getTime();
  if (!Number.isFinite(baselineTime)) {
    return entries;
  }

  return entries.filter((entry) => {
    if (entry.type === "admin_import_baseline") {
      return true;
    }
    const createdAt = entry.createdAt ? new Date(entry.createdAt).getTime() : NaN;
    return Number.isFinite(createdAt) && createdAt >= baselineTime;
  });
}

export async function PATCH(request: NextRequest) {
  let adminUser;

  try {
    adminUser = await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "").trim();

  if (action === "import-point-baselines") {
    return importPointBaselines(body, adminUser.email ?? adminUser.id);
  }

  if (action === "freeze" || action === "unfreeze") {
    return updatePartnerSecurity(body, adminUser.email ?? adminUser.id, action);
  }

  const userIds = Array.isArray(body?.userIds)
    ? body.userIds.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)
    : [];
  const mode = String(body?.mode ?? "").trim();
  const amount = Math.floor(Number(body?.amount ?? 0));
  const reason = String(body?.reason ?? "").trim();

  if (mode !== "add" && mode !== "deduct") {
    return NextResponse.json({ message: "请选择增加或扣减。" }, { status: 400 });
  }

  if (userIds.length === 0) {
    return NextResponse.json({ message: "请选择至少一个合伙人。" }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "请输入大于 0 的积分数量。" }, { status: 400 });
  }

  if (!reason) {
    return NextResponse.json({ message: "请输入调整原因。" }, { status: 400 });
  }

  const delta = mode === "add" ? amount : -amount;
  const results = [];

  for (const userId of userIds) {
    const { data: userData, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (fetchError || !userData.user) {
      results.push({
        userId,
        success: false,
        message: fetchError?.message ?? "User not found",
      });
      continue;
    }

    const adjustment = appendManualPointAdjustment({
      metadata: userData.user.user_metadata,
      delta,
      reason,
      adminEmail: adminUser.email ?? adminUser.id,
    });

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: adjustment.metadata,
    });

    if (!updateError) {
      await insertPointTransaction(userId, adjustment.pointTransaction);
    }

    results.push({
      userId,
      success: !updateError,
      beforePoints: adjustment.beforePoints,
      afterPoints: adjustment.afterPoints,
      message: updateError?.message ?? null,
    });
  }

  const failed = results.filter((result) => !result.success);
  return NextResponse.json(
    {
      success: failed.length === 0,
      updatedCount: results.length - failed.length,
      failedCount: failed.length,
      results,
    },
    { status: failed.length === results.length ? 500 : 200 }
  );
}

async function importPointBaselines(body: unknown, adminEmail: string) {
  const payload = body as Record<string, unknown> | null;
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];

  if (rows.length === 0) {
    return NextResponse.json({ message: "请上传至少一条积分基准数据。" }, { status: 400 });
  }

  const normalizedRows = rows
    .map((row, index) => normalizeImportRow(row, index + 1))
    .filter((row) => row.uid || row.username);

  if (normalizedRows.length === 0) {
    return NextResponse.json({ message: "未找到有效 UID 或账号。" }, { status: 400 });
  }

  const users = await listAllAuthUsers().catch((error) => {
    console.error("[partners import users]", error);
    return null;
  });
  if (!users) {
    return NextResponse.json({ message: "Failed to fetch users" }, { status: 500 });
  }
  const byUid = new Map<string, typeof users[number]>();
  const byUsername = new Map<string, typeof users[number]>();

  for (const user of users) {
    const metadata = user.user_metadata ?? {};
    const uid = readString(metadata.quicksdk_uid);
    const username = readString(metadata.quicksdk_username) || readString(metadata.username) || readString(user.email);

    if (uid) {
      byUid.set(uid, user);
    }
    if (username) {
      byUsername.set(username.toLowerCase(), user);
    }
  }

  const results = [];

  for (const row of normalizedRows) {
    const user =
      (row.uid ? byUid.get(row.uid) : null) ||
      (row.username ? byUsername.get(row.username.toLowerCase()) : null);

    if (!user) {
      results.push({
        row: row.row,
        uid: row.uid,
        username: row.username,
        success: false,
        message: "User not found",
      });
      continue;
    }

    const baseline = applyImportedPointBaseline({
      metadata: user.user_metadata,
      points: row.points,
      partnerCode: row.partnerCode,
      adminEmail,
    });

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: baseline.metadata,
    });

    if (!error) {
      await insertPointTransaction(user.id, baseline.pointTransaction);
    }

    results.push({
      row: row.row,
      userId: user.id,
      uid: row.uid || readString(user.user_metadata?.quicksdk_uid),
      username: row.username || readString(user.user_metadata?.quicksdk_username),
      success: !error,
      beforePoints: baseline.beforePoints,
      afterPoints: baseline.afterPoints,
      baselineAt: baseline.metadata.mir_import_baseline_at,
      message: error?.message ?? null,
    });
  }

  const failed = results.filter((result) => !result.success);
  return NextResponse.json(
    {
      success: failed.length === 0,
      updatedCount: results.length - failed.length,
      failedCount: failed.length,
      results,
    },
    { status: failed.length === results.length ? 500 : 200 }
  );
}

async function listAllAuthUsers() {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw new Error(error.message);
    }

    users.push(...data.users);
    if (data.users.length < 1000) {
      break;
    }
    page += 1;
  }

  return users;
}

function normalizeImportRow(row: unknown, rowNumber: number) {
  const source = row && typeof row === "object" ? row as Record<string, unknown> : {};
  return {
    row: rowNumber,
    uid: readString(source.uid || source.quicksdk_uid || source.quickSdkUid || source.quick_uid),
    username: readString(source.username || source.account || source.loginName || source.login_name),
    partnerCode: readString(source.partnerCode || source.partner_code || source.code),
    points: Math.max(0, Math.floor(readNumber(source.points || source.mir_points || source.point))),
  };
}

async function updatePartnerSecurity(body: unknown, adminEmail: string, action: "freeze" | "unfreeze") {
  const payload = body as Record<string, unknown> | null;
  const userId = String(payload?.userId ?? "").trim();

  if (!userId) {
    return NextResponse.json({ message: "请选择一个合伙人。" }, { status: 400 });
  }

  const { data: userData, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (fetchError || !userData.user) {
    return NextResponse.json(
      { message: fetchError?.message ?? "User not found" },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();
  const metadata = { ...(userData.user.user_metadata ?? {}) };

  if (action === "unfreeze") {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...metadata,
        account_status: "active",
        account_frozen_until: null,
        account_frozen_reason: null,
        account_unfrozen_at: now,
        account_unfrozen_by: adminEmail,
      },
    });

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, accountStatus: "active" });
  }

  const frozenUntilInput = String(payload?.frozenUntil ?? "").trim();
  const reason = String(payload?.reason ?? "").trim();
  const frozenUntil = new Date(frozenUntilInput);

  if (!frozenUntilInput || Number.isNaN(frozenUntil.getTime())) {
    return NextResponse.json({ message: "请选择有效的冻结结束时间。" }, { status: 400 });
  }

  if (frozenUntil.getTime() <= Date.now()) {
    return NextResponse.json({ message: "冻结结束时间必须晚于当前时间。" }, { status: 400 });
  }

  if (!reason) {
    return NextResponse.json({ message: "请输入冻结原因。" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...metadata,
      account_status: "frozen",
      account_frozen_until: frozenUntil.toISOString(),
      account_frozen_reason: reason,
      account_frozen_at: now,
      account_frozen_by: adminEmail,
    },
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    accountStatus: "frozen",
    frozenUntil: frozenUntil.toISOString(),
  });
}

export async function POST(request: NextRequest) {
  let adminUser;

  try {
    adminUser = await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const userId = String(body?.userId ?? "").trim();
  const amount = Math.floor(Number(body?.amount ?? 0));
  const issueToSdk = body?.issueToSdk === true;
  const sdkConfirm = String(body?.sdkConfirm ?? "").trim();
  const remark = String(body?.remark ?? "").trim() || "管理员测试订单";
  const orderNo =
    String(body?.orderNo ?? "").trim() ||
    `TEST${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  if (!userId) {
    return NextResponse.json({ message: "请选择一个合伙人。" }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "请输入大于 0 的订单金额。" }, { status: 400 });
  }

  if (issueToSdk && sdkConfirm !== "CONFIRM") {
    return NextResponse.json({ message: "实际发放到 SDK 钱包需要输入 CONFIRM。" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return NextResponse.json(
      { message: error?.message ?? "User not found" },
      { status: 404 }
    );
  }

  const existingWalletTransactions = await readWalletTransactionsFromDb(userId);
  const duplicate = existingWalletTransactions.some((item) => item.id === `sdk-order-${orderNo}`);

  if (duplicate) {
    return NextResponse.json({ message: "该测试订单号已存在。" }, { status: 409 });
  }

  const sdkUid = String(data.user.user_metadata?.quicksdk_uid ?? "").trim();
  let sdkWalletAmount: number | null = null;

  if (issueToSdk) {
    if (!sdkUid) {
      return NextResponse.json({ message: "该用户缺少 QuickSDK UID，无法发放到 SDK 钱包。" }, { status: 400 });
    }

    try {
      sdkWalletAmount = await changeQuickSdkPlatformCoins({
        userId: sdkUid,
        amount: String(amount),
        remark: `${remark} / ${orderNo} / admin real SDK issue`,
      });
    } catch (sdkError) {
      return NextResponse.json(
        {
          message: `QuickSDK 钱包发放失败：${sdkError instanceof Error ? sdkError.message : "Unknown error"}`,
        },
        { status: 502 }
      );
    }
  }

  const testOrder = appendAdminTestRechargeOrder({
    metadata: data.user.user_metadata,
    amount,
    orderNo,
    remark: issueToSdk ? `${remark} / SDK 钱包已实发` : remark,
    adminEmail: adminUser.email ?? adminUser.id,
  });

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: testOrder.metadata,
  });

  if (updateError) {
    return NextResponse.json(
      { message: "测试订单创建失败。", error: updateError.message },
      { status: 500 }
    );
  }

  await Promise.all([
    insertWalletTransaction(userId, testOrder.walletTransaction),
    insertPointTransaction(userId, testOrder.pointTransaction),
  ]);

  return NextResponse.json({
    success: true,
    orderNo: testOrder.orderNo,
    amount,
    awardedPoints: testOrder.awardedPoints,
    sdkIssued: issueToSdk,
    sdkWalletAmount,
    beforePoints: testOrder.beforePoints,
    afterPoints: testOrder.afterPoints,
    beforeCoins: testOrder.beforeCoins,
    afterCoins: testOrder.afterCoins,
  });
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
