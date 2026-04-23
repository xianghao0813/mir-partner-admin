import { redirect } from "next/navigation";
import { getAdminSessionUser } from "@/lib/auth";
import AdminShell from "@/app/components/AdminShell";
import AccountsManagerClient from "@/app/components/AccountsManagerClient";

export default async function AccountsPage() {
  const user = await getAdminSessionUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AdminShell
      section="accounts"
      title="账户管理"
      description="管理后台账号、权限分组、访问等级、账户状态，以及密码重置和强制下线等安全操作。"
    >
      <AccountsManagerClient />
    </AdminShell>
  );
}
