"use client";

import { useMemo, useState } from "react";
import { adminPath } from "@/lib/paths";

type QueryRow = Record<string, unknown>;

type QueryResponse = {
  success?: boolean;
  projectId?: number;
  appId?: string;
  sql?: string;
  headers?: string[];
  rows?: unknown[];
  message?: string;
};

const amountKeys = ["amount", "dealAmount", "realAmount", "pay_amount", "money", "price", "recharge_amount"];
const platformKeys = ["platform", "channel", "channelCode", "payType", "payTypeName", "os", "store"];

export default function ThinkingDataClient() {
  const [uid, setUid] = useState("");
  const [month, setMonth] = useState(getCurrentMonth());
  const [eventKeyword, setEventKeyword] = useState("pay");
  const [platformKeyword, setPlatformKeyword] = useState("");
  const [limit, setLimit] = useState("100");
  const [rows, setRows] = useState<QueryRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sql, setSql] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredRows = useMemo(() => {
    const keyword = platformKeyword.trim().toLowerCase();
    if (!keyword) {
      return rows;
    }

    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(keyword));
  }, [platformKeyword, rows]);

  const summary = useMemo(() => {
    let totalAmount = 0;
    let amountCount = 0;
    const platformCounts = new Map<string, number>();

    for (const row of filteredRows) {
      const amount = findNumber(row, amountKeys);
      if (amount > 0) {
        totalAmount += amount;
        amountCount += 1;
      }

      const platform = findString(row, platformKeys);
      if (platform) {
        platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
      }
    }

    return {
      eventCount: filteredRows.length,
      amountCount,
      totalAmount,
      platforms: Array.from(platformCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [filteredRows]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setRows([]);
    setHeaders([]);
    setSql("");

    try {
      const params = new URLSearchParams({
        uid: uid.trim(),
        month,
        limit: String(Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)))),
      });
      if (eventKeyword.trim()) {
        params.set("eventKeyword", eventKeyword.trim());
      }

      const response = await fetch(adminPath(`/api/admin/thinkingdata/events?${params.toString()}`), {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as QueryResponse | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "数数数据查询失败。");
      }

      setHeaders(payload.headers ?? []);
      setRows((payload.rows ?? []).filter(isRow));
      setSql(payload.sql ?? "");
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : "数数数据查询失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <form onSubmit={handleSubmit} style={panelStyle}>
        <div style={sectionTitleStyle}>UID 事件查询</div>
        <div style={formGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>UID</span>
            <input value={uid} onChange={(event) => setUid(event.target.value)} placeholder="例如 1123658" style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>月份</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>事件关键词</span>
            <input value={eventKeyword} onChange={(event) => setEventKeyword(event.target.value)} placeholder="pay / recharge / order" style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>平台关键词</span>
            <input value={platformKeyword} onChange={(event) => setPlatformKeyword(event.target.value)} placeholder="wechat / alipay / ios" style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>最多条数</span>
            <input type="number" min="1" max="500" value={limit} onChange={(event) => setLimit(event.target.value)} style={inputStyle} />
          </label>
        </div>
        <button type="submit" disabled={loading || !uid.trim()} style={primaryButtonStyle}>
          {loading ? "查询中..." : "查询数数数据"}
        </button>
      </form>

      {error ? <div style={errorStyle}>{error}</div> : null}

      <section style={summaryGridStyle}>
        <Metric label="事件数量" value={summary.eventCount.toLocaleString()} />
        <Metric label="识别到金额的事件" value={summary.amountCount.toLocaleString()} />
        <Metric label="金额合计" value={`¥${summary.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
      </section>

      <section style={panelStyle}>
        <div style={sectionTitleStyle}>平台分布</div>
        {summary.platforms.length === 0 ? (
          <div style={emptyStyle}>暂无可识别的平台字段。可以先查看原始事件字段后再调整平台关键词。</div>
        ) : (
          <div style={platformListStyle}>
            {summary.platforms.map(([platform, count]) => (
              <div key={platform} style={platformItemStyle}>
                <span>{platform}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={panelStyle}>
        <div style={sectionHeaderStyle}>
          <div style={sectionTitleStyle}>原始事件</div>
          <div style={hintStyle}>显示 {filteredRows.length.toLocaleString()} 条</div>
        </div>
        {filteredRows.length === 0 ? (
          <div style={emptyStyle}>暂无数据。</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {headers.slice(0, 12).map((header) => (
                    <th key={header} style={thStyle}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={index}>
                    {headers.slice(0, 12).map((header) => (
                      <td key={header} style={tdStyle}>{formatCell(row[header])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sql ? (
        <section style={panelStyle}>
          <div style={sectionTitleStyle}>SQL</div>
          <pre style={sqlStyle}>{sql}</pre>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article style={metricStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </article>
  );
}

function getCurrentMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function isRow(value: unknown): value is QueryRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findNumber(row: QueryRow, keys: string[]) {
  for (const key of keys) {
    const value = findValue(row, key);
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }
  return 0;
}

function findString(row: QueryRow, keys: string[]) {
  for (const key of keys) {
    const value = findValue(row, key);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function findValue(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  const object = source as QueryRow;
  if (key in object) {
    return object[key];
  }
  for (const value of Object.values(object)) {
    const found = findValue(value, key);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

const wrapStyle: React.CSSProperties = { display: "grid", gap: "18px" };
const panelStyle: React.CSSProperties = { padding: "22px", borderRadius: "24px", background: "rgba(16,16,24,0.82)", border: "1px solid rgba(124,58,237,0.18)" };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "14px" };
const sectionTitleStyle: React.CSSProperties = { fontSize: "22px", fontWeight: 900, marginBottom: "14px" };
const formGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "14px" };
const fieldStyle: React.CSSProperties = { display: "grid", gap: "8px" };
const labelStyle: React.CSSProperties = { color: "#c4b5fd", fontSize: "13px", fontWeight: 800 };
const inputStyle: React.CSSProperties = { minHeight: "42px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", padding: "0 12px", outline: "none" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: "12px", padding: "0 16px", minHeight: "42px", background: "linear-gradient(90deg, #7c3aed, #a855f7)", color: "#fff", fontWeight: 900, cursor: "pointer" };
const errorStyle: React.CSSProperties = { padding: "12px 14px", borderRadius: "14px", background: "rgba(127,29,29,0.25)", border: "1px solid rgba(248,113,113,0.28)", color: "#fecaca", fontSize: "14px" };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" };
const metricStyle: React.CSSProperties = { padding: "18px", borderRadius: "18px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" };
const metricValueStyle: React.CSSProperties = { marginTop: "10px", color: "#fff", fontSize: "30px", fontWeight: 900 };
const hintStyle: React.CSSProperties = { color: "#9ca3af", fontSize: "13px" };
const emptyStyle: React.CSSProperties = { color: "#9ca3af", fontSize: "14px", lineHeight: 1.7 };
const platformListStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "10px" };
const platformItemStyle: React.CSSProperties = { display: "flex", gap: "8px", alignItems: "center", padding: "10px 12px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", color: "#e5e7eb" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: "860px" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px", color: "#d8b4fe", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: "12px" };
const tdStyle: React.CSSProperties = { padding: "12px", color: "#e5e7eb", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "12px", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const sqlStyle: React.CSSProperties = { margin: 0, whiteSpace: "pre-wrap", color: "#cbd5e1", fontSize: "12px", lineHeight: 1.7 };
