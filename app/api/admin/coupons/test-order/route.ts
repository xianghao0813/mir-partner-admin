import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { appendAdminCouponTestOrder } from "@/lib/partners";
import { changeQuickSdkPlatformCoins } from "@/lib/quicksdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CouponRecord = {
  id: string;
  user_id: string;
  coupon_code: string;
  title: string;
  discount_type: "amount" | "percent";
  discount_value: number;
  min_amount: number;
  applicable_package_ids: number[] | null;
  starts_at: string;
  expires_at: string;
  used_at: string | null;
};

const packageMap = new Map([
  [1, { id: 1, coins: 100, amount: 100 }],
  [2, { id: 2, coins: 300, amount: 300 }],
  [3, { id: 3, coins: 500, amount: 500 }],
  [4, { id: 4, coins: 1000, amount: 1000 }],
  [5, { id: 5, coins: 5000, amount: 5000 }],
  [6, { id: 6, coins: 10000, amount: 10000 }],
  [7, { id: 7, coins: 20000, amount: 20000 }],
  [8, { id: 8, coins: 30000, amount: 30000 }],
]);

export async function POST(request: NextRequest) {
  let adminUser;

  try {
    adminUser = await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const userId = String(body?.userId ?? "").trim();
  const couponId = String(body?.couponId ?? "").trim();
  const packageId = Math.floor(Number(body?.packageId ?? 0));
  const issueToSdk = body?.issueToSdk === true;
  const sdkConfirm = String(body?.sdkConfirm ?? "").trim();
  const remark = String(body?.remark ?? "").trim() || "管理员优惠券测试订单";
  const orderNo =
    String(body?.orderNo ?? "").trim() ||
    `CPT${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const selectedPackage = packageMap.get(packageId);

  if (!userId) {
    return NextResponse.json({ message: "请选择一个合伙人。" }, { status: 400 });
  }

  if (!couponId) {
    return NextResponse.json({ message: "请选择一张未使用优惠券。" }, { status: 400 });
  }

  if (!selectedPackage) {
    return NextResponse.json({ message: "请选择有效的云币商品。" }, { status: 400 });
  }

  if (issueToSdk && sdkConfirm !== "CONFIRM") {
    return NextResponse.json({ message: "实际发放到 SDK 钱包需要输入 CONFIRM。" }, { status: 400 });
  }

  const { data: couponData, error: couponError } = await supabaseAdmin
    .from("user_coupons")
    .select("*")
    .eq("id", couponId)
    .eq("user_id", userId)
    .maybeSingle();

  if (couponError) {
    return NextResponse.json({ message: couponError.message }, { status: 500 });
  }

  if (!couponData) {
    return NextResponse.json({ message: "优惠券不存在。" }, { status: 404 });
  }

  const coupon = couponData as CouponRecord;
  if (!isCouponUsable(coupon)) {
    return NextResponse.json({ message: "该优惠券已使用或已过期。" }, { status: 400 });
  }

  if (!isPackageApplicable(coupon, selectedPackage.id, selectedPackage.amount)) {
    return NextResponse.json({ message: "该商品不符合优惠券使用条件。" }, { status: 400 });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData.user) {
    return NextResponse.json({ message: userError?.message ?? "User not found" }, { status: 404 });
  }

  const sdkUid = String(userData.user.user_metadata?.quicksdk_uid ?? "").trim();
  let sdkWalletAmount: number | null = null;

  if (issueToSdk) {
    if (!sdkUid) {
      return NextResponse.json({ message: "该用户缺少 QuickSDK UID，无法发放到 SDK 钱包。" }, { status: 400 });
    }

    try {
      sdkWalletAmount = await changeQuickSdkPlatformCoins({
        userId: sdkUid,
        amount: String(selectedPackage.coins),
        remark: `${remark} / ${orderNo} / coupon test SDK issue`,
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

  const paidAmount = applyDiscount(selectedPackage.amount, coupon);
  const result = appendAdminCouponTestOrder({
    metadata: userData.user.user_metadata,
    orderNo,
    adminEmail: adminUser.email ?? adminUser.id,
    remark: issueToSdk ? `${remark} / SDK 钱包已实发` : remark,
    originalAmount: selectedPackage.amount,
    paidAmount,
    coins: selectedPackage.coins,
    couponCode: coupon.coupon_code,
  });

  const nowIso = new Date().toISOString();
  const { data: usedCoupon, error: useError } = await supabaseAdmin
    .from("user_coupons")
    .update({
      used_at: nowIso,
      used_order_no: orderNo,
    })
    .eq("id", coupon.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (useError || !usedCoupon) {
    return NextResponse.json({ message: useError?.message ?? "优惠券已经被使用。" }, { status: 409 });
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: result.metadata,
  });

  if (updateError) {
    return NextResponse.json({ message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    orderNo,
    originalAmount: selectedPackage.amount,
    paidAmount,
    coins: selectedPackage.coins,
    awardedPoints: result.awardedPoints,
    sdkIssued: issueToSdk,
    sdkWalletAmount,
    beforePoints: result.beforePoints,
    afterPoints: result.afterPoints,
    beforeCoins: result.beforeCoins,
    afterCoins: result.afterCoins,
  });
}

function isCouponUsable(coupon: CouponRecord) {
  if (coupon.used_at) {
    return false;
  }

  const now = Date.now();
  return new Date(coupon.starts_at).getTime() <= now && now <= new Date(coupon.expires_at).getTime();
}

function isPackageApplicable(coupon: CouponRecord, packageId: number, amount: number) {
  const ids = Array.isArray(coupon.applicable_package_ids) ? coupon.applicable_package_ids : [];
  if (ids.length > 0 && !ids.includes(packageId)) {
    return false;
  }

  return amount >= Number(coupon.min_amount || 0);
}

function applyDiscount(amount: number, coupon: CouponRecord) {
  const discountValue = Math.max(0, Number(coupon.discount_value || 0));
  const discount =
    coupon.discount_type === "percent"
      ? amount * Math.min(discountValue, 100) / 100
      : discountValue;
  return Math.max(0.01, Math.round((amount - discount) * 100) / 100);
}
