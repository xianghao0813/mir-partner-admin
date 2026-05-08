import { redirect } from "next/navigation";
import AdminShell from "@/app/components/AdminShell";
import ThinkingDataClient from "@/app/components/ThinkingDataClient";
import { getAdminSessionUser } from "@/lib/auth";

export default async function AnalyticsPage() {
  const user = await getAdminSessionUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AdminShell
      section="analytics"
      title="数数数据查询"
      description="通过 UID、月份、事件关键词和平台关键词查询 ThinkingData 中的用户事件，用于结算核对、用户行为分析和后续数据同步准备。"
    >
      <ThinkingDataClient />
    </AdminShell>
  );
}
