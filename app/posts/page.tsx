import { redirect } from "next/navigation";
import { getAdminSessionUser } from "@/lib/auth";
import AdminShell from "@/app/components/AdminShell";
import PostsManagerClient from "@/app/components/PostsManagerClient";

export default async function PostsPage() {
  const user = await getAdminSessionUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AdminShell
      section="posts"
      title="帖子管理"
      description="创建、编辑、预览和发布新闻内容，并通过草稿、立即发布、预约发布等状态管理投放流程。"
    >
      <PostsManagerClient currentAdminEmail={user.email ?? ""} />
    </AdminShell>
  );
}
