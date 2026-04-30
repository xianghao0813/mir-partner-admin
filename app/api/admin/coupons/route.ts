import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CouponDiscountType = "amount" | "percent";

export async function POST(request: NextRequest) {
  let adminUser;

  try {
    adminUser = await requireAdminSessionUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const userIds: string[] = Array.isArray(body?.userIds)
    ? body.userIds.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)
    : [];
  const title = String(body?.title ?? "").trim();
  const description = String(body?.description ?? "").trim();
  const discountType = normalizeDiscountType(body?.discountType);
  const discountValue = Number(body?.discountValue ?? 0);
  const minAmount = Math.max(0, Number(body?.minAmount ?? 0));
  const packageIds = normalizePackageIds(body?.packageIds);
  const startsAt = normalizeDate(body?.startsAt, new Date());
  const expiresAt = normalizeDate(body?.expiresAt, null);

  if (userIds.length === 0) {
    return NextResponse.json({ message: "请选择至少一个合伙人。" }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ message: "请输入优惠券名称。" }, { status: 400 });
  }

  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ message: "请输入有效的优惠金额或折扣比例。" }, { status: 400 });
  }

  if (discountType === "percent" && discountValue > 100) {
    return NextResponse.json({ message: "百分比折扣不能超过 100%。" }, { status: 400 });
  }

  if (!expiresAt) {
    return NextResponse.json({ message: "请选择优惠券到期时间。" }, { status: 400 });
  }

  if (new Date(startsAt).getTime() >= new Date(expiresAt).getTime()) {
    return NextResponse.json({ message: "到期时间必须晚于生效时间。" }, { status: 400 });
  }

  const rows = userIds.map((userId) => ({
    user_id: userId,
    coupon_code: buildCouponCode(),
    title,
    description,
    discount_type: discountType,
    discount_value: discountValue,
    min_amount: minAmount,
    applicable_package_ids: packageIds,
    starts_at: startsAt,
    expires_at: expiresAt,
  }));

  const { data, error } = await supabaseAdmin
    .from("user_coupons")
    .insert(rows)
    .select("id,user_id,coupon_code");

  if (error) {
    return NextResponse.json(
      {
        message: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    count: data?.length ?? 0,
    coupons: data ?? [],
  });
}

function normalizeDiscountType(value: unknown): CouponDiscountType {
  return value === "percent" ? "percent" : "amount";
}

function normalizePackageIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => Math.floor(Number(item)))
    .filter((item) => Number.isFinite(item) && item >= 1 && item <= 8);
}

function normalizeDate(value: unknown, fallback: Date | null) {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return fallback ? fallback.toISOString() : "";
}

function buildCouponCode() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CP${Date.now().toString(36).toUpperCase()}${random}`.slice(0, 24);
}
