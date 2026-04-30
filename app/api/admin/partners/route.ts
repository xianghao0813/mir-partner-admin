import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import {
  appendAdminTestRechargeOrder,
  appendManualPointAdjustment,
  buildPartnerRecords,
  filterLedgerByMonth,
} from "@/lib/partners";
import { changeQuickSdkPlatformCoins } from "@/lib/quicksdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  return NextResponse.json({
    totalPartners: partners.length,
    partners: filtered.map((partner) => ({
      ...partner,
      pointTransactions: filterLedgerByMonth(partner.pointTransactions, month),
      coinTransactions: filterLedgerByMonth(partner.coinTransactions, month),
    })),
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

  const existingWalletTransactions = Array.isArray(data.user.user_metadata?.wallet_transactions)
    ? data.user.user_metadata.wallet_transactions
    : [];
  const duplicate = existingWalletTransactions.some((item) => {
    if (!item || typeof item !== "object") return false;
    return String((item as Record<string, unknown>).id ?? "") === `sdk-order-${orderNo}`;
  });

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
