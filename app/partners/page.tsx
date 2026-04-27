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
      title="合伙人管理"
      description="集中查看合伙人账号、合伙人编码、MIR 积分、星级、云币余额、最近登录，以及积分和云币月度明细。"
    >
      <PartnersManagerClient />
    </AdminShell>
  );
}

function normalizePartnerSubsection(value: string | undefined) {
  return value === "points" || value === "test-order" ? value : "list";
}
