import { NextRequest, NextResponse } from "next/server";
import { requireAdminSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPartnerRecords, filterLedgerByMonth } from "@/lib/partners";

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
