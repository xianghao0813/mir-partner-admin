import { redirect } from "next/navigation";
import { getAdminSessionUser } from "@/lib/auth";
import AdminShell from "@/app/components/AdminShell";
import DashboardOverviewClient from "@/app/components/DashboardOverviewClient";

export default async function DashboardPage() {
  const user = await getAdminSessionUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AdminShell
      section="dashboard"
      title="大盘概览"
      description="查看后台核心指标，并为后续用户分析、内容分析和运营统计预留扩展入口。"
    >
      <DashboardOverviewClient />
    </AdminShell>
  );
}
