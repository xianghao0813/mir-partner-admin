"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
type PartnerTab = "list" | "points" | "test-order";

type ThinkingDataEventRow = Record<string, unknown>;

const partnerTabs: { key: PartnerTab; label: string }[] = [
  { key: "list", label: "파트너 목록" },
  { key: "points", label: "포인트 조정" },
  { key: "test-order", label: "테스트 주문" },
];

export default function PartnersManagerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [totalPartners, setTotalPartners] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(getCurrentMonth());
  const [ledgerMode, setLedgerMode] = useState<LedgerMode | null>(null);
  const [thinkingDataOpen, setThinkingDataOpen] = useState(false);
  const [thinkingDataRows, setThinkingDataRows] = useState<ThinkingDataEventRow[]>([]);
  const [thinkingDataHeaders, setThinkingDataHeaders] = useState<string[]>([]);
  const [thinkingDataLoading, setThinkingDataLoading] = useState(false);
  const [thinkingDataError, setThinkingDataError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adjustMode, setAdjustMode] = useState<"add" | "deduct">("add");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [testAmount, setTestAmount] = useState("");
  const [testOrderNo, setTestOrderNo] = useState("");
  const [testRemark, setTestRemark] = useState("管理员测试订单");
  const [creatingTestOrder, setCreatingTestOrder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const activeTab = normalizeTab(searchParams.get("tab"));

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedId) ?? partners[0] ?? null,
    [partners, selectedId]
  );

  useEffect(() => {
    void loadPartners();
  }, []);

  function setActiveTab(tab: PartnerTab) {
    router.push(`/partners?tab=${tab}`, { scroll: false });
  }

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
      setSelectedIds((current) =>
        current.filter((id) => nextPartners.some((partner) => partner.id === id))
      );
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

  function toggleSelectedId(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedIds(checked ? partners.map((partner) => partner.id) : []);
  }

  async function handleAdjustPoints(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const amount = Math.floor(Number(adjustAmount));

    if (selectedIds.length === 0) {
      setError("请选择至少一个合伙人。");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("请输入大于 0 的积分数量。");
      return;
    }

    if (!adjustReason.trim()) {
      setError("请输入调整原因。");
      return;
    }

    setAdjusting(true);

    try {
      const res = await fetch(adminPath("/api/admin/partners"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: selectedIds,
          mode: adjustMode,
          amount,
          reason: adjustReason,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "积分调整失败。");
      }

      setMessage(`积分调整完成：成功 ${json?.updatedCount ?? 0} 个，失败 ${json?.failedCount ?? 0} 个。`);
      setAdjustAmount("");
      setAdjustReason("");
      await loadPartners({ q: query, month });
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "积分调整失败。");
    } finally {
      setAdjusting(false);
    }
  }

  async function handleCreateTestOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const amount = Math.floor(Number(testAmount));

    if (!selectedPartner) {
      setError("请选择一个合伙人。");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("请输入大于 0 的测试订单金额。");
      return;
    }

    setCreatingTestOrder(true);

    try {
      const res = await fetch(adminPath("/api/admin/partners"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedPartner.id,
          amount,
          orderNo: testOrderNo,
          remark: testRemark,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "测试订单创建失败。");
      }

      setMessage(
        `测试订单已创建：${json?.orderNo ?? ""}，增加 ${Number(
          json?.awardedPoints ?? 0
        ).toLocaleString()} 积分。`
      );
      setTestAmount("");
      setTestOrderNo("");
      setTestRemark("管理员测试订单");
      await loadPartners({ q: query, month });
      setLedgerMode("points");
    } catch (testOrderError) {
      setError(testOrderError instanceof Error ? testOrderError.message : "测试订单创建失败。");
    } finally {
      setCreatingTestOrder(false);
    }
  }

  const activeLedger =
    ledgerMode === "points"
      ? selectedPartner?.pointTransactions ?? []
      : ledgerMode === "coins"
        ? selectedPartner?.coinTransactions ?? []
        : [];

  async function loadThinkingDataEvents() {
    if (!selectedPartner?.uid) {
      setThinkingDataError("UID is required.");
      return;
    }

    setThinkingDataOpen(true);
    setThinkingDataLoading(true);
    setThinkingDataError("");

    try {
      const search = new URLSearchParams({
        uid: selectedPartner.uid,
        month,
        limit: "100",
      });
      const res = await fetch(adminPath(`/api/admin/thinkingdata/events?${search.toString()}`), {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "ThinkingData query failed.");
      }

      setThinkingDataHeaders(Array.isArray(json?.headers) ? json.headers : []);
      setThinkingDataRows(Array.isArray(json?.rows) ? json.rows : []);
    } catch (loadError) {
      setThinkingDataError(
        loadError instanceof Error ? loadError.message : "ThinkingData query failed."
      );
      setThinkingDataHeaders([]);
      setThinkingDataRows([]);
    } finally {
      setThinkingDataLoading(false);
    }
  }

  return (
    <>
    <div style={tabsStyle}>
      {partnerTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setActiveTab(tab.key)}
          style={{
            ...tabButtonStyle,
            ...(activeTab === tab.key ? activeTabButtonStyle : null),
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>

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
        {message && <div style={successStyle}>{message}</div>}
        {activeTab === "points" ? (
        <form onSubmit={handleAdjustPoints} style={adjustPanelStyle}>
          <div style={adjustHeaderStyle}>
            <div>
              <div style={eyebrowStyle}>Manual Points</div>
              <strong>管理员积分调整</strong>
              <div style={mutedTextStyle}>已选择 {selectedIds.length} 个合伙人</div>
            </div>
            <div style={modeGroupStyle}>
              <button
                type="button"
                onClick={() => setAdjustMode("add")}
                style={{
                  ...modeButtonStyle,
                  ...(adjustMode === "add" ? activeModeButtonStyle : null),
                }}
              >
                增加
              </button>
              <button
                type="button"
                onClick={() => setAdjustMode("deduct")}
                style={{
                  ...modeButtonStyle,
                  ...(adjustMode === "deduct" ? activeModeButtonStyle : null),
                }}
              >
                扣减
              </button>
            </div>
          </div>
          <div style={adjustFormGridStyle}>
            <input
              type="number"
              min="1"
              value={adjustAmount}
              onChange={(event) => setAdjustAmount(event.target.value)}
              placeholder="积分数量"
              style={compactInputStyle}
            />
            <input
              value={adjustReason}
              onChange={(event) => setAdjustReason(event.target.value)}
              placeholder="调整原因"
              style={compactInputStyle}
            />
            <button type="submit" disabled={adjusting} style={primaryButtonStyle}>
              {adjusting ? "处理中..." : "提交调整"}
            </button>
          </div>
        </form>
        ) : null}
        {loading ? (
          <div style={emptyStyle}>加载合伙人数据...</div>
        ) : partners.length === 0 ? (
          <div style={emptyStyle}>暂无匹配的合伙人。</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>
                    <input
                      type="checkbox"
                      checked={partners.length > 0 && selectedIds.length === partners.length}
                      onChange={(event) => toggleAllVisible(event.target.checked)}
                      aria-label="选择全部可见合伙人"
                    />
                  </th>
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
                      <td style={tdStyle} onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(partner.id)}
                          onChange={() => toggleSelectedId(partner.id)}
                          aria-label={`选择 ${partner.partnerCode}`}
                        />
                      </td>
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
              <button type="button" onClick={loadThinkingDataEvents} style={secondaryButtonStyle}>
                ThinkingData 记录
              </button>
            </div>

            {activeTab === "test-order" ? (
            <form onSubmit={handleCreateTestOrder} style={testOrderPanelStyle}>
              <div>
                <div style={eyebrowStyle}>Test Order</div>
                <strong>创建测试订单</strong>
                <div style={mutedTextStyle}>
                  金额会同时增加云币，并按金额 x100 写入 MIR 积分明细。
                </div>
              </div>
              <input
                type="number"
                min="1"
                value={testAmount}
                onChange={(event) => setTestAmount(event.target.value)}
                placeholder="订单金额 / 云币"
                style={compactInputStyle}
              />
              <input
                value={testOrderNo}
                onChange={(event) => setTestOrderNo(event.target.value)}
                placeholder="测试订单号，可留空自动生成"
                style={compactInputStyle}
              />
              <input
                value={testRemark}
                onChange={(event) => setTestRemark(event.target.value)}
                placeholder="订单备注"
                style={compactInputStyle}
              />
              <button type="submit" disabled={creatingTestOrder} style={primaryButtonStyle}>
                {creatingTestOrder ? "创建中..." : "创建测试订单"}
              </button>
            </form>
            ) : null}

          </>
        ) : (
          <div style={emptyStyle}>请选择一个合伙人。</div>
        )}
      </aside>
    </div>
    {thinkingDataOpen ? (
      <div style={modalOverlayStyle} onClick={() => setThinkingDataOpen(false)}>
        <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
          <div style={modalHeaderStyle}>
            <div>
              <div style={eyebrowStyle}>{selectedPartner?.partnerCode ?? "-"}</div>
              <h3 style={modalTitleStyle}>ThinkingData 记录</h3>
            </div>
            <button type="button" onClick={() => setThinkingDataOpen(false)} style={closeButtonStyle}>
              关闭
            </button>
          </div>

          <div style={modalToolbarStyle}>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              style={monthInputStyle}
            />
            <button type="button" onClick={loadThinkingDataEvents} style={secondaryButtonStyle}>
              查询
            </button>
            <span style={mutedTextStyle}>UID: {selectedPartner?.uid ?? "-"}</span>
          </div>

          {thinkingDataError ? <div style={errorStyle}>{thinkingDataError}</div> : null}
          {thinkingDataLoading ? (
            <div style={emptyStyle}>ThinkingData 数据加载中...</div>
          ) : thinkingDataRows.length === 0 ? (
            <div style={emptyStyle}>当前月份暂无 ThinkingData 记录。</div>
          ) : (
            <div style={thinkingDataListStyle}>
              {thinkingDataRows.map((row, index) => (
                <div key={index} style={thinkingDataItemStyle}>
                  <strong>{getThinkingDataEventName(row)}</strong>
                  <div style={dateTextStyle}>{getThinkingDataEventTime(row)}</div>
                  <pre style={thinkingDataJsonStyle}>{JSON.stringify(row, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}

          {thinkingDataHeaders.length > 0 ? (
            <div style={mutedTextStyle}>字段：{thinkingDataHeaders.join(", ")}</div>
          ) : null}
        </div>
      </div>
    ) : null}
    {ledgerMode ? (
      <div style={modalOverlayStyle} onClick={() => setLedgerMode(null)}>
        <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
          <div style={modalHeaderStyle}>
            <div>
              <div style={eyebrowStyle}>{selectedPartner?.partnerCode ?? "-"}</div>
              <h3 style={modalTitleStyle}>{ledgerMode === "points" ? "积分明细" : "云币明细"}</h3>
            </div>
            <button type="button" onClick={() => setLedgerMode(null)} style={closeButtonStyle}>
              关闭
            </button>
          </div>

          <div style={modalToolbarStyle}>
            <input
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                void loadPartners({ q: query, month: event.target.value });
              }}
              style={monthInputStyle}
            />
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
                  <span style={entry.amount < 0 ? deductAmountStyle : amountStyle}>
                    {entry.amount > 0 ? "+" : ""}
                    {entry.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ) : null}
    </>
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

function getThinkingDataEventName(row: ThinkingDataEventRow) {
  return String(row["#event_name"] ?? row.event_name ?? row.eventName ?? "Unknown Event");
}

function getThinkingDataEventTime(row: ThinkingDataEventRow) {
  const value =
    row["#time"] ??
    row["#event_time"] ??
    row["#server_time"] ??
    row.event_time ??
    row.eventTime ??
    row.time;

  return value ? String(value) : "-";
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

function normalizeTab(value: string | null): PartnerTab {
  return value === "points" || value === "test-order" ? value : "list";
}

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const tabButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "14px",
  padding: "12px 16px",
  background: "rgba(255,255,255,0.04)",
  color: "#d1d5db",
  fontWeight: 800,
  cursor: "pointer",
};

const activeTabButtonStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(124,58,237,0.24), rgba(168,85,247,0.18))",
  border: "1px solid rgba(192,132,252,0.3)",
  color: "white",
};

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

const compactInputStyle: React.CSSProperties = {
  ...inputStyle,
  minWidth: 0,
  width: "100%",
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

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "rgba(0,0,0,0.62)",
  backdropFilter: "blur(8px)",
};

const modalStyle: React.CSSProperties = {
  width: "min(760px, 100%)",
  maxHeight: "82vh",
  overflow: "hidden",
  borderRadius: "22px",
  background: "rgba(16,16,24,0.96)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
  padding: "20px",
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  marginBottom: "14px",
};

const modalTitleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: "26px",
};

const modalToolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "14px",
};

const closeButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  padding: "10px 13px",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const thinkingDataListStyle: React.CSSProperties = {
  display: "grid",
  gap: "12px",
  maxHeight: "56vh",
  overflowY: "auto",
};

const thinkingDataItemStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "12px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const thinkingDataJsonStyle: React.CSSProperties = {
  margin: 0,
  padding: "12px",
  borderRadius: "10px",
  background: "#020617",
  color: "#dbeafe",
  fontSize: "12px",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const ledgerListStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  maxHeight: "56vh",
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

const deductAmountStyle: React.CSSProperties = {
  ...amountStyle,
  color: "#fca5a5",
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

const successStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  color: "#bbf7d0",
  background: "rgba(34,197,94,0.12)",
  border: "1px solid rgba(74,222,128,0.2)",
  marginBottom: "12px",
};

const adjustPanelStyle: React.CSSProperties = {
  padding: "14px",
  borderRadius: "18px",
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.07)",
  marginBottom: "16px",
  display: "grid",
  gap: "12px",
};

const testOrderPanelStyle: React.CSSProperties = {
  marginTop: "16px",
  padding: "14px",
  borderRadius: "18px",
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.07)",
  display: "grid",
  gap: "10px",
};

const adjustHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const modeGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
};

const modeButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  padding: "9px 13px",
  background: "rgba(255,255,255,0.04)",
  color: "#d1d5db",
  fontWeight: 800,
  cursor: "pointer",
};

const activeModeButtonStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.24)",
  border: "1px solid rgba(192,132,252,0.35)",
  color: "white",
};

const adjustFormGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "150px minmax(220px, 1fr) auto",
  gap: "10px",
};
