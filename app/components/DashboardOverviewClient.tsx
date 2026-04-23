"use client";

import { useEffect, useMemo, useState } from "react";
import { adminPath } from "@/lib/paths";

type AdminUser = {
  id: string;
};

type Notice = {
  id: number;
  showOnHome: boolean;
};

export default function DashboardOverviewClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setError("");

        const [usersRes, noticesRes] = await Promise.all([
          fetch(adminPath("/api/admin/users"), { cache: "no-store" }),
          fetch(adminPath("/api/admin/notices"), { cache: "no-store" }),
        ]);

        const usersJson = await usersRes.json().catch(() => null);
        const noticesJson = await noticesRes.json().catch(() => null);

        if (!usersRes.ok) {
          throw new Error(usersJson?.message ?? "Failed to fetch users");
        }

        if (!noticesRes.ok) {
          throw new Error(noticesJson?.message ?? "Failed to fetch notices");
        }

        setUsers(usersJson?.users ?? []);
        setNotices(noticesJson?.notices ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
      }
    }

    void load();
  }, []);

  const cards = useMemo(
    () => [
      {
        label: "管理员账户",
        value: String(users.length),
        hint: "当前后台认证体系中的管理员总数",
      },
      {
        label: "新闻总数",
        value: String(notices.length),
        hint: "当前已录入后台的新闻内容总量",
      },
      {
        label: "首页精选",
        value: String(notices.filter((item) => item.showOnHome).length),
        hint: "会同步展示到前台首页的精选内容",
      },
      {
        label: "分析模块",
        value: "待扩展",
        hint: "后续可接入 DAU、留存、转化和内容效果分析",
      },
    ],
    [notices, users.length]
  );

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      {error ? <div style={errorStyle}>{error}</div> : null}

      <section style={panelStyle}>
        <div style={panelTitleStyle}>主要指标</div>
        <div style={gridStyle}>
          {cards.map((card) => (
            <article key={card.label} style={cardStyle}>
              <div style={labelStyle}>{card.label}</div>
              <div style={valueStyle}>{card.value}</div>
              <div style={hintStyle}>{card.hint}</div>
            </article>
          ))}
        </div>
      </section>

      <section style={panelStyle}>
        <div style={panelTitleStyle}>规划中的后台能力</div>
        <div style={roadmapStyle}>
          <article style={roadmapCardStyle}>
            <div style={roadmapTitleStyle}>用户数据中心</div>
            <div style={hintStyle}>用户画像、状态标签、行为轨迹、运营备注和权限分组。</div>
          </article>
          <article style={roadmapCardStyle}>
            <div style={roadmapTitleStyle}>运营分析看板</div>
            <div style={hintStyle}>注册漏斗、活跃趋势、内容点击、活动转化和收入表现。</div>
          </article>
          <article style={roadmapCardStyle}>
            <div style={roadmapTitleStyle}>内容协作流</div>
            <div style={hintStyle}>草稿、审核、定时发布、回滚、版本记录和审批状态。</div>
          </article>
        </div>
      </section>
    </div>
  );
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
  marginBottom: "16px",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
};

const cardStyle: React.CSSProperties = {
  padding: "18px",
  borderRadius: "18px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const labelStyle: React.CSSProperties = {
  color: "#c4b5fd",
  fontSize: "13px",
  fontWeight: 700,
};

const valueStyle: React.CSSProperties = {
  marginTop: "10px",
  marginBottom: "8px",
  fontSize: "34px",
  fontWeight: 800,
};

const hintStyle: React.CSSProperties = {
  color: "#9ca3af",
  lineHeight: 1.7,
  fontSize: "13px",
};

const roadmapStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "12px",
};

const roadmapCardStyle: React.CSSProperties = {
  padding: "18px",
  borderRadius: "18px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const roadmapTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  marginBottom: "10px",
};

const errorStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: "14px",
  background: "rgba(127,29,29,0.25)",
  border: "1px solid rgba(248,113,113,0.28)",
  color: "#fecaca",
  fontSize: "14px",
};
