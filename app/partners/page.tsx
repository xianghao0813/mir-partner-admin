import { redirect } from "next/navigation";
import { getAdminSessionUser } from "@/lib/auth";
import AdminShell from "@/app/components/AdminShell";
import PartnersManagerClient from "@/app/components/PartnersManagerClient";

type Props = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

export default async function PartnersPage({ searchParams }: Props) {
  const user = await getAdminSessionUser();
  const params = await searchParams;
  const partnerSubsection = normalizePartnerSubsection(params?.tab);

  if (!user) {
    redirect("/login");
  }

  return (
    <AdminShell
      section="partners"
      partnerSubsection={partnerSubsection}
      title="MIR Partner"
      description="查看合伙人账号、合伙人编码、MIR 积分、星级、云币余额、明细记录，并进行积分、测试订单与优惠券管理。"
    >
      <PartnersManagerClient />
    </AdminShell>
  );
}

function normalizePartnerSubsection(value: string | undefined) {
  return value === "points" || value === "test-order" || value === "coupons" ? value : "list";
}
