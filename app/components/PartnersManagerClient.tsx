"use client";

import { useEffect, useMemo, useState } from "react";
import { adminPath } from "@/lib/paths";

type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  title: string;
  description: string;
  createdAt: string | null;
};

type PartnerRecord = {
  id: string;
  email: string;
  uid: string;
  username: string;
  partnerCode: string;
  partnerNumber: number;
  points: number;
  tier: { id: number; label: string; minPoints: number };
  cloudCoins: number;
  lastSignInAt: string | null;
  createdAt: string | null;
  pointTransactions: LedgerEntry[];
  coinTransactions: LedgerEntry[];
};

type LedgerMode = "points" | "coins";

export default function PartnersManagerClient() {
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [totalPartners, setTotalPartners] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(getCurrentMonth());
  const [ledgerMode, setLedgerMode] = useState<LedgerMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedId) ?? partners[0] ?? null,
    [partners, selectedId]
  );

  useEffect(() => {
    void loadPartners();
  }, []);

  async function loadPartners(params?: { q?: string; month?: string }) {
    setLoading(true);
    setError("");

    try {
      const search = new URLSearchParams();
      const nextQuery = params?.q ?? query;
      const nextMonth = params?.month ?? month;

      if (nextQuery.trim()) {
        search.set("q", nextQuery.trim());
      }

      if (nextMonth.trim()) {
        search.set("month", nextMonth.trim());
      }

      const res = await fetch(adminPath(`/api/admin/partners?${search.toString()}`), {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to fetch partners");
      }

      const nextPartners = (json?.partners ?? []) as PartnerRecord[];
      setPartners(nextPartners);
      setTotalPartners(Number(json?.totalPartners ?? 0));
      setSelectedId((current) =>
        current && nextPartners.some((partner) => partner.id === current)
          ? current
          : nextPartners[0]?.id ?? null
      );
      setLedgerMode(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to fetch partners");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadPartners({ q: query, month });
  }

  const activeLedger =
    ledgerMode === "points"
      ? selectedPartner?.pointTransactions ?? []
      : ledgerMode === "coins"
        ? selectedPartner?.coinTransactions ?? []
        : [];

  return (
    <div style={pageGridStyle}>
      <section style={panelStyle}>
        <div style={toolbarStyle}>
          <div>
            <div style={eyebrowStyle}>Partner Count</div>
            <strong style={countStyle}>{totalPartners.toLocaleString()}</strong>
            <span style={mutedTextStyle}> 合伙人</span>
          </div>

          <form onSubmit={handleSearch} style={searchFormStyle}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 UID / 合伙人编码"
              style={inputStyle}
            />
            <input
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                void loadPartners({ q: query, month: event.target.value });
              }}
              style={monthInputStyle}
            />
            <button type="submit" style={primaryButtonStyle}>
              查询
            </button>
          </form>
        </div>

        {error && <div style={errorStyle}>{error}</div>}
        {loading ? (
          <div style={emptyStyle}>加载合伙人数据...</div>
        ) : partners.length === 0 ? (
          <div style={emptyStyle}>暂无匹配的合伙人。</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>合伙人编码</th>
                  <th style={thStyle}>UID</th>
                  <th style={thStyle}>账号</th>
                  <th style={thStyle}>星级</th>
                  <th style={thStyle}>积分</th>
                  <th style={thStyle}>云币</th>
                  <th style={thStyle}>最近登录</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((partner) => {
                  const active = selectedPartner?.id === partner.id;
                  return (
                    <tr
                      key={partner.id}
                      onClick={() => {
                        setSelectedId(partner.id);
                        setLedgerMode(null);
                      }}
                      style={{
                        ...trStyle,
                        ...(active ? activeTrStyle : null),
                      }}
                    >
                      <td style={tdStrongStyle}>{partner.partnerCode}</td>
                      <td style={tdStyle}>{partner.uid}</td>
                      <td style={tdStyle}>{partner.username || partner.email || "-"}</td>
                      <td style={tdStyle}>{partner.tier.label}</td>
                      <td style={tdStyle}>{partner.points.toLocaleString()}</td>
                      <td style={tdStyle}>{partner.cloudCoins.toLocaleString()}</td>
                      <td style={tdStyle}>{formatDate(partner.lastSignInAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside style={panelStyle}>
        {selectedPartner ? (
          <>
            <div style={detailHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>Partner Detail</div>
                <h3 style={detailTitleStyle}>{selectedPartner.partnerCode}</h3>
              </div>
              <span style={badgeStyle}>No. {selectedPartner.partnerNumber.toLocaleString()}</span>
            </div>

            <div style={metricGridStyle}>
              <Metric label="UID" value={selectedPartner.uid || "-"} />
              <Metric label="当前 MIR 积分" value={`${selectedPartner.points.toLocaleString()} 分`} />
              <Metric label="当前星级" value={selectedPartner.tier.label} />
              <Metric label="当前云币" value={selectedPartner.cloudCoins.toLocaleString()} />
              <Metric label="最近接入日" value={formatDate(selectedPartner.lastSignInAt)} />
              <Metric label="账号" value={selectedPartner.username || selectedPartner.email || "-"} />
            </div>

            <div style={actionRowStyle}>
              <button type="button" onClick={() => setLedgerMode("points")} style={secondaryButtonStyle}>
                查看积分明细
              </button>
              <button type="button" onClick={() => setLedgerMode("coins")} style={secondaryButtonStyle}>
                查看云币明细
              </button>
            </div>

            {ledgerMode && (
              <div style={ledgerPanelStyle}>
                <div style={ledgerHeaderStyle}>
                  <strong>{ledgerMode === "points" ? "积分明细" : "云币明细"}</strong>
                  <span style={mutedTextStyle}>{month || "全部月份"}</span>
                </div>

                {activeLedger.length === 0 ? (
                  <div style={emptyStyle}>该月份暂无明细。</div>
                ) : (
                  <div style={ledgerListStyle}>
                    {activeLedger.map((entry) => (
                      <div key={entry.id} style={ledgerItemStyle}>
                        <div>
                          <strong>{entry.title}</strong>
                          <div style={mutedTextStyle}>{entry.description}</div>
                          <div style={dateTextStyle}>{formatDate(entry.createdAt)}</div>
                        </div>
                        <span style={amountStyle}>
                          {entry.amount > 0 ? "+" : ""}
                          {entry.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={emptyStyle}>请选择一个合伙人。</div>
        )}
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  );
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const pageGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(360px, 0.65fr)",
  gap: "18px",
  alignItems: "start",
};

const panelStyle: React.CSSProperties = {
  borderRadius: "24px",
  background: "rgba(16,16,24,0.82)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 20px 40px rgba(0,0,0,0.28)",
  padding: "20px",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const searchFormStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const inputStyle: React.CSSProperties = {
  minWidth: "240px",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  outline: "none",
};

const monthInputStyle: React.CSSProperties = {
  ...inputStyle,
  minWidth: "150px",
  colorScheme: "dark",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: "12px",
  padding: "12px 18px",
  background: "linear-gradient(90deg, #7c3aed, #a855f7)",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(192,132,252,0.28)",
  borderRadius: "12px",
  padding: "11px 14px",
  background: "rgba(124,58,237,0.14)",
  color: "#f5d0fe",
  fontWeight: 800,
  cursor: "pointer",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  color: "#c4b5fd",
  fontSize: "13px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const tdStyle: React.CSSProperties = {
  padding: "13px 12px",
  color: "#d1d5db",
  borderBottom: "1px solid rgba(255,255,255,0.055)",
  fontSize: "14px",
};

const tdStrongStyle: React.CSSProperties = {
  ...tdStyle,
  color: "white",
  fontWeight: 800,
};

const trStyle: React.CSSProperties = {
  cursor: "pointer",
};

const activeTrStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.15)",
};

const eyebrowStyle: React.CSSProperties = {
  color: "#c084fc",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const countStyle: React.CSSProperties = {
  color: "white",
  fontSize: "34px",
};

const mutedTextStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "13px",
};

const detailHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "flex-start",
  marginBottom: "16px",
};

const detailTitleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: "28px",
};

const badgeStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#e5e7eb",
  fontWeight: 800,
  fontSize: "13px",
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
};

const metricStyle: React.CSSProperties = {
  padding: "14px",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const metricLabelStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  marginBottom: "8px",
};

const metricValueStyle: React.CSSProperties = {
  color: "white",
  fontWeight: 850,
  wordBreak: "break-word",
};

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "16px",
};

const ledgerPanelStyle: React.CSSProperties = {
  marginTop: "16px",
  paddingTop: "16px",
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

const ledgerHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "12px",
};

const ledgerListStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  maxHeight: "360px",
  overflowY: "auto",
};

const ledgerItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  padding: "12px",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const amountStyle: React.CSSProperties = {
  color: "#86efac",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const dateTextStyle: React.CSSProperties = {
  color: "#71717a",
  fontSize: "12px",
  marginTop: "4px",
};

const emptyStyle: React.CSSProperties = {
  padding: "20px",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.04)",
  color: "#a1a1aa",
  textAlign: "center",
};

const errorStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  color: "#fecaca",
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(248,113,113,0.2)",
  marginBottom: "12px",
};
