"use client";

import { useEffect, useState } from "react";
import { adminPath } from "@/lib/paths";

type AdminUser = {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  role: string | null;
  roleGroup: string;
  accessLevel: number;
  status: string;
  forceLogoutAt: string | null;
};

const roleGroupOptions = [
  { value: "super_admin", label: "Super Admin" },
  { value: "ops_manager", label: "Ops Manager" },
  { value: "content_manager", label: "Content Manager" },
  { value: "analyst", label: "Analyst" },
];

const statusOptions = [
  { value: "active", label: "启用" },
  { value: "readonly", label: "只读" },
  { value: "suspended", label: "停用" },
];

const permissionGuide = [
  {
    role: "Super Admin",
    description: "可以创建、删除管理员账户，管理所有后台账号权限，并执行高风险操作。",
  },
  {
    role: "Ops Manager",
    description: "用于运营管理。适合处理内容、合伙人数据和日常运营任务。",
  },
  {
    role: "Content Manager",
    description: "用于公告、文章、首页 Banner 等内容维护。",
  },
  {
    role: "Analyst",
    description: "用于查看数据，默认不应执行创建、删除或高风险修改。",
  },
];

export default function AccountsManagerClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [currentAdminRoleGroup, setCurrentAdminRoleGroup] = useState("");
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [currentAdminEmail, setCurrentAdminEmail] = useState("");
  const [currentAdminAccessLevel, setCurrentAdminAccessLevel] = useState(0);

  const [email, setEmail] = useState("");
  const [roleGroup, setRoleGroup] = useState("content_manager");
  const [accessLevel, setAccessLevel] = useState(3);
  const [status, setStatus] = useState("active");
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [temporaryPasswords, setTemporaryPasswords] = useState<Record<string, string>>({});
  const [activeSubsection, setActiveSubsection] = useState<"create" | "manage">("manage");
  const canManageAdminAccounts = currentAdminRoleGroup === "super_admin";

  useEffect(() => {
    void loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(adminPath("/api/admin/users"), { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to fetch admin users");
      }

      setUsers(json?.users ?? []);
      setCurrentAdminRoleGroup(json?.currentAdmin?.roleGroup ?? "");
      setCurrentAdminId(json?.currentAdmin?.id ?? "");
      setCurrentAdminEmail(json?.currentAdmin?.email ?? "");
      setCurrentAdminAccessLevel(Number(json?.currentAdmin?.accessLevel ?? 0));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to fetch admin users");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!canManageAdminAccounts) {
      setError("只有 Super Admin 可以创建管理员账户。");
      return;
    }

    if (!email.trim()) {
      setError("请输入管理员邮箱。");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch(adminPath("/api/admin/users"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, roleGroup, accessLevel, status }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to create admin user");
      }

      setEmail("");
      setRoleGroup("content_manager");
      setAccessLevel(3);
      setStatus("active");
      setMessage(`管理员邀请邮件已发送：${json?.user?.email ?? ""}`);
      await loadUsers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create admin user");
    } finally {
      setCreating(false);
    }
  }

  function handleUserFieldChange(
    userId: string,
    field: "roleGroup" | "accessLevel" | "status",
    value: string | number
  ) {
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, [field]: value } : user))
    );
  }

  function handleTemporaryPasswordChange(userId: string, value: string) {
    setTemporaryPasswords((prev) => ({ ...prev, [userId]: value }));
  }

  async function handleSaveUser(user: AdminUser) {
    setSavingId(user.id);
    setError("");
    setMessage("");

    try {
      const res = await fetch(adminPath(`/api/admin/users/${user.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleGroup: user.roleGroup,
          accessLevel: user.accessLevel,
          status: user.status,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to update admin user");
      }

      setMessage(`账户权限已更新：${user.email}`);
      await loadUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update admin user");
    } finally {
      setSavingId(null);
    }
  }

  async function handleResetPassword(user: AdminUser) {
    const temporaryPassword = temporaryPasswords[user.id]?.trim() ?? "";

    if (temporaryPassword.length < 8) {
      setError("临时密码至少需要 8 位。");
      setMessage("");
      return;
    }

    setActionId(user.id);
    setError("");
    setMessage("");

    try {
      const res = await fetch(adminPath(`/api/admin/users/${user.id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_password",
          temporaryPassword,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to reset password");
      }

      setTemporaryPasswords((prev) => ({ ...prev, [user.id]: "" }));
      setMessage(`已重置临时密码：${user.email}`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to reset password");
    } finally {
      setActionId(null);
    }
  }

  async function handleForceLogout(user: AdminUser) {
    setActionId(user.id);
    setError("");
    setMessage("");

    try {
      const res = await fetch(adminPath(`/api/admin/users/${user.id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "force_logout",
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to force logout");
      }

      setMessage(`已强制下线：${user.email}`);
      await loadUsers();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to force logout");
    } finally {
      setActionId(null);
    }
  }

  async function handleDeleteUser(user: AdminUser) {
    if (!canManageAdminAccounts) {
      setError("只有 Super Admin 可以删除管理员账户。");
      setMessage("");
      return;
    }

    if (user.id === currentAdminId) {
      setError("不能删除当前登录中的管理员账户。");
      setMessage("");
      return;
    }

    const confirmed = window.confirm(`确定删除管理员账户 ${user.email || "无邮箱"} 吗？此操作不可恢复。`);

    if (!confirmed) {
      return;
    }

    setActionId(user.id);
    setError("");
    setMessage("");

    try {
      const res = await fetch(adminPath(`/api/admin/users/${user.id}`), {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to delete admin account");
      }

      setMessage(`管理员账户已删除：${user.email}`);
      await loadUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete admin account");
    } finally {
      setActionId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section style={panelStyle}>
        <div style={headerRowStyle}>
          <div>
            <div style={panelTitleStyle}>当前登录管理员</div>
            <div style={itemMetaStyle}>{currentAdminEmail || "加载中..."}</div>
          </div>
          <div style={roleBadgeStyle}>
            {currentAdminRoleGroup || "-"} · Lv.{currentAdminAccessLevel || "-"}
          </div>
        </div>

        <div style={permissionGridStyle}>
          {permissionGuide.map((item) => (
            <div key={item.role} style={permissionCardStyle}>
              <strong>{item.role}</strong>
              <div style={itemMetaStyle}>{item.description}</div>
            </div>
          ))}
        </div>

        {!canManageAdminAccounts ? (
          <div style={readonlyNoticeStyle}>
            当前账户不是 Super Admin，因此不会显示“删除账户”按钮，也不能创建新的管理员账户。
          </div>
        ) : null}
      </section>

      <div style={subNavWrapStyle}>
        <button
          type="button"
          onClick={() => setActiveSubsection("create")}
          style={{
            ...subNavButtonStyle,
            ...(activeSubsection === "create" ? activeSubNavButtonStyle : null),
          }}
        >
          管理员创建
        </button>
        <button
          type="button"
          onClick={() => setActiveSubsection("manage")}
          style={{
            ...subNavButtonStyle,
            ...(activeSubsection === "manage" ? activeSubNavButtonStyle : null),
          }}
        >
          账户管理
        </button>
      </div>

      {activeSubsection === "create" ? (
      <section style={panelStyle}>
        <div style={panelTitleStyle}>邀请管理员账户</div>
        {!canManageAdminAccounts ? (
          <div style={readonlyNoticeStyle}>只有 Super Admin 可以创建新的管理员账户。</div>
        ) : null}
        <div style={helperTextStyle}>
          系统会向管理员邮箱发送邀请链接。对方打开邮件后完成邮箱验证，并自行设置登录密码。
        </div>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="管理员邮箱"
            style={inputStyle}
            disabled={!canManageAdminAccounts}
          />
          <div style={threeColStyle}>
            <select
              value={roleGroup}
              onChange={(e) => setRoleGroup(e.target.value)}
              style={inputStyle}
              disabled={!canManageAdminAccounts}
            >
              {roleGroupOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={String(accessLevel)}
              onChange={(e) => setAccessLevel(Number(e.target.value))}
              style={inputStyle}
              disabled={!canManageAdminAccounts}
            >
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  Access Lv.{level}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={inputStyle}
              disabled={!canManageAdminAccounts}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {error ? <div style={errorStyle}>{error}</div> : null}
          {message ? <div style={messageStyle}>{message}</div> : null}
          <button type="submit" disabled={creating || !canManageAdminAccounts} style={buttonStyle}>
            {creating ? "发送中..." : "发送邀请"}
          </button>
        </form>
      </section>
      ) : null}

      {activeSubsection === "manage" ? (
      <section style={panelStyle}>
        <div style={headerRowStyle}>
          <div style={panelTitleStyle}>账户与权限</div>
          <button type="button" onClick={() => void loadUsers()} style={ghostButtonStyle}>
            刷新
          </button>
        </div>

        {loading ? (
          <div style={stateStyle}>正在加载管理员账户...</div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {users.map((user) => (
              <article key={user.id} style={itemStyle}>
                <div style={itemTitleStyle}>{user.email || "无邮箱"}</div>
                <div style={itemMetaStyle}>创建时间：{formatDateTime(user.createdAt)}</div>
                <div style={itemMetaStyle}>最近登录：{formatDateTime(user.lastSignInAt)}</div>
                <div style={itemMetaStyle}>
                  邮箱状态：{user.emailConfirmedAt ? "已验证" : "未验证"}
                </div>
                <div style={itemMetaStyle}>
                  强制下线时间：{formatDateTime(user.forceLogoutAt)}
                </div>

                <div style={threeColStyle}>
                  <select
                    value={user.roleGroup}
                    onChange={(e) => handleUserFieldChange(user.id, "roleGroup", e.target.value)}
                    style={inputStyle}
                  >
                    {roleGroupOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={String(user.accessLevel)}
                    onChange={(e) => handleUserFieldChange(user.id, "accessLevel", Number(e.target.value))}
                    style={inputStyle}
                  >
                    {[1, 2, 3, 4, 5].map((level) => (
                      <option key={level} value={level}>
                        Access Lv.{level}
                      </option>
                    ))}
                  </select>
                  <select
                    value={user.status}
                    onChange={(e) => handleUserFieldChange(user.id, "status", e.target.value)}
                    style={inputStyle}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={actionsRowStyle}>
                  <span style={itemMetaStyle}>系统角色：{user.role ?? "authenticated"}</span>
                  <button
                    type="button"
                    onClick={() => void handleSaveUser(user)}
                    style={ghostButtonStyle}
                    disabled={savingId === user.id}
                  >
                    {savingId === user.id ? "保存中..." : "保存权限"}
                  </button>
                </div>

                <div style={securityPanelStyle}>
                  <div style={securityTitleStyle}>安全操作</div>
                  <div style={securityGridStyle}>
                    <input
                      type="password"
                      value={temporaryPasswords[user.id] ?? ""}
                      onChange={(e) => handleTemporaryPasswordChange(user.id, e.target.value)}
                      placeholder="输入新的临时密码"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => void handleResetPassword(user)}
                      style={ghostButtonStyle}
                      disabled={actionId === user.id}
                    >
                      {actionId === user.id ? "处理中..." : "重置密码"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleForceLogout(user)}
                      style={dangerButtonStyle}
                      disabled={actionId === user.id}
                    >
                      {actionId === user.id ? "处理中..." : "强制下线"}
                    </button>
                    {canManageAdminAccounts ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteUser(user)}
                        style={deleteButtonStyle}
                        disabled={actionId === user.id || user.id === currentAdminId}
                        title={user.id === currentAdminId ? "不能删除当前登录账户" : "删除管理员账户"}
                      >
                        {actionId === user.id ? "处理中..." : "删除账户"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      ) : null}
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const panelStyle: React.CSSProperties = {
  padding: "22px",
  borderRadius: "24px",
  background: "rgba(16,16,24,0.82)",
  border: "1px solid rgba(124,58,237,0.18)",
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 800,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  marginBottom: "16px",
  flexWrap: "wrap",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: "14px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.24)",
  color: "white",
  boxSizing: "border-box",
};

const threeColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
};

const securityGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) repeat(3, auto)",
  gap: "10px",
  alignItems: "center",
};

const buttonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: "14px",
  padding: "14px 18px",
  background: "linear-gradient(90deg, #7c3aed, #a855f7)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const ghostButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  padding: "10px 14px",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(248,113,113,0.25)",
  borderRadius: "12px",
  padding: "10px 14px",
  background: "rgba(127,29,29,0.25)",
  color: "#fecaca",
  fontWeight: 700,
  cursor: "pointer",
};

const deleteButtonStyle: React.CSSProperties = {
  ...dangerButtonStyle,
  background: "rgba(185,28,28,0.38)",
  border: "1px solid rgba(248,113,113,0.42)",
};

const readonlyNoticeStyle: React.CSSProperties = {
  marginTop: "10px",
  marginBottom: "12px",
  padding: "12px 14px",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "#cbd5e1",
  fontSize: "14px",
};

const helperTextStyle: React.CSSProperties = {
  marginTop: "8px",
  marginBottom: "12px",
  color: "#a1a1aa",
  fontSize: "14px",
  lineHeight: 1.7,
};

const subNavWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const subNavButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "14px",
  padding: "12px 16px",
  background: "rgba(255,255,255,0.04)",
  color: "#d1d5db",
  fontWeight: 800,
  cursor: "pointer",
};

const activeSubNavButtonStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(124,58,237,0.24), rgba(168,85,247,0.18))",
  border: "1px solid rgba(192,132,252,0.3)",
  color: "white",
};

const roleBadgeStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "999px",
  background: "rgba(124,58,237,0.2)",
  border: "1px solid rgba(192,132,252,0.28)",
  color: "#f5d0fe",
  fontWeight: 800,
};

const permissionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px",
};

const permissionCardStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const messageStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: "14px",
  background: "rgba(20,83,45,0.25)",
  border: "1px solid rgba(74,222,128,0.26)",
  color: "#bbf7d0",
  fontSize: "14px",
};

const errorStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: "14px",
  background: "rgba(127,29,29,0.25)",
  border: "1px solid rgba(248,113,113,0.28)",
  color: "#fecaca",
  fontSize: "14px",
};

const stateStyle: React.CSSProperties = {
  color: "#9ca3af",
  padding: "16px 0",
};

const itemStyle: React.CSSProperties = {
  padding: "14px",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const itemTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontWeight: 700,
  fontSize: "16px",
  overflowWrap: "anywhere",
  marginBottom: "6px",
};

const itemMetaStyle: React.CSSProperties = {
  color: "#9ca3af",
  marginTop: "4px",
  fontSize: "13px",
  lineHeight: 1.6,
};

const actionsRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  marginTop: "10px",
  flexWrap: "wrap",
};

const securityPanelStyle: React.CSSProperties = {
  marginTop: "14px",
  paddingTop: "14px",
  borderTop: "1px solid rgba(255,255,255,0.06)",
  display: "grid",
  gap: "10px",
};

const securityTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#d8b4fe",
};
