"use client";

import { useEffect, useMemo, useState } from "react";
import { adminPath } from "@/lib/paths";

type DashboardMetrics = {
  partnerCount: number;
  todayRechargeAmount: number;
  totalRechargeAmount: number;
  todayActiveUsers: number;
  todayPaidUsers: number;
  paymentRate: number;
  range: {
    timezone: string;
    startIso: string;
    endIso: string;
  };
};

const emptyMetrics: DashboardMetrics = {
  partnerCount: 0,
  todayRechargeAmount: 0,
  totalRechargeAmount: 0,
  todayActiveUsers: 0,
  todayPaidUsers: 0,
  paymentRate: 0,
  range: {
    timezone: "Asia/Shanghai",
    startIso: "",
    endIso: "",
  },
};

export default function DashboardOverviewClient() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(adminPath("/api/admin/dashboard"), { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(json?.message ?? "Failed to fetch dashboard metrics");
        }

        setMetrics({
          ...emptyMetrics,
          ...json,
          range: {
            ...emptyMetrics.range,
            ...(json?.range ?? {}),
          },
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const cards = useMemo(
    () => [
      {
        label: "合伙人总账号数",
        value: metrics.partnerCount.toLocaleString(),
        hint: "已绑定 QuickSDK UID 的前台合伙人账号总数",
      },
      {
        label: "今日充值金额",
        value: formatMoney(metrics.todayRechargeAmount),
        hint: "按上海时区统计今日首页/钱包充值成功金额",
      },
      {
        label: "累计充值金额",
        value: formatMoney(metrics.totalRechargeAmount),
        hint: "所有已支付订单累计金额",
      },
      {
        label: "今日 DAU",
        value: metrics.todayActiveUsers.toLocaleString(),
        hint: "今日登录或访问过前台账号的合伙人数",
      },
      {
        label: "今日付费人数",
        value: metrics.todayPaidUsers.toLocaleString(),
        hint: "今日至少完成一笔充值的合伙人数",
      },
      {
        label: "今日支付率",
        value: formatPercent(metrics.paymentRate),
        hint: "今日付费人数 / 今日 DAU",
      },
    ],
    [metrics]
  );

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      {error ? <div style={errorStyle}>{error}</div> : null}

      <section style={panelStyle}>
        <div style={headerRowStyle}>
          <div>
            <div style={panelTitleStyle}>前台运营概览</div>
            <div style={hintStyle}>
              {metrics.range.startIso
                ? `今日统计区间：${formatDateTime(metrics.range.startIso)} - ${formatDateTime(metrics.range.endIso)} (${metrics.range.timezone})`
                : "今日统计区间按 Asia/Shanghai 计算"}
            </div>
          </div>
          <button type="button" onClick={() => window.location.reload()} style={refreshButtonStyle}>
            刷新
          </button>
        </div>

        {loading ? (
          <div style={stateStyle}>加载数据...</div>
        ) : (
          <div style={gridStyle}>
            {cards.map((card) => (
              <article key={card.label} style={cardStyle}>
                <div style={labelStyle}>{card.label}</div>
                <div style={valueStyle}>{card.value}</div>
                <div style={hintStyle}>{card.hint}</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatMoney(value: number) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number) {
  return `${Math.round(Number(value || 0) * 10000) / 100}%`;
}

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
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

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 800,
  marginBottom: "8px",
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

const stateStyle: React.CSSProperties = {
  padding: "42px 16px",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.03)",
  color: "#9ca3af",
  textAlign: "center",
};

const refreshButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  padding: "10px 14px",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: "14px",
  background: "rgba(127,29,29,0.25)",
  border: "1px solid rgba(248,113,113,0.28)",
  color: "#fecaca",
  fontSize: "14px",
};
