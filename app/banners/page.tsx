import { redirect } from "next/navigation";
import { getAdminSessionUser } from "@/lib/auth";
import AdminShell from "@/app/components/AdminShell";
import BannersManagerClient from "@/app/components/BannersManagerClient";

export default async function BannersPage() {
  const user = await getAdminSessionUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AdminShell
      section="banners"
      title="Banner Management"
      description="Manage homepage banner images, links, display order, and active status for the public site."
    >
      <BannersManagerClient />
    </AdminShell>
  );
}
