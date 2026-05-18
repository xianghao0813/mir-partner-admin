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
  importBaselineAt: string | null;
  importBaselinePoints: number;
  importMode: string;
  tier: { id: number; label: string; minPoints: number };
  cloudCoins: number;
  totalRechargeAmount: number;
  realNameVerified: boolean;
  phone: string;
  maskedPhone: string;
  accountStatus: "active" | "frozen";
  frozenAt: string | null;
  frozenUntil: string | null;
  frozenReason: string;
  frozenBy: string;
  frozenSource: "auto" | "manual";
  lastSignInAt: string | null;
  createdAt: string | null;
  pointTransactions: LedgerEntry[];
  coinTransactions: LedgerEntry[];
};

type LedgerMode = "points" | "coins";
type PartnerTab = "list" | "frozen" | "points" | "import-baseline" | "test-order" | "coupons" | "security";

type CouponItem = {
  id: string;
  code: string;
  title: string;
  discountType: "amount" | "percent";
  discountValue: number;
  minAmount: number;
  applicablePackageIds: number[];
  expiresAt: string;
  status: "unused" | "expired" | "used";
};

type RiskEvent = {
  id: string;
  eventType: string;
  severity: "low" | "medium" | "high" | "critical";
  score: number;
  source: string;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type ImportPointRow = {
  uid: string;
  username: string;
  partnerCode: string;
  points: number;
};

const partnerTabs: { key: PartnerTab; label: string }[] = [
  { key: "list", label: "合伙人列表" },
  { key: "frozen", label: "冻结名单" },
  { key: "points", label: "积分调整" },
  { key: "import-baseline", label: "积分导入" },
  { key: "test-order", label: "测试订单" },
  { key: "coupons", label: "优惠券" },
  { key: "security", label: "账号风控" },
];

const packageOptions = [
  { id: 1, label: "2 云币" },
  { id: 2, label: "300 云币" },
  { id: 3, label: "500 云币" },
  { id: 4, label: "1,000 云币" },
  { id: 5, label: "5,000 云币" },
  { id: 6, label: "10,000 云币" },
  { id: 7, label: "20,000 云币" },
  { id: 8, label: "30,000 云币" },
];

export default function PartnersManagerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = normalizeTab(searchParams.get("tab"));
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [totalPartners, setTotalPartners] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(getCurrentMonth());
  const [ledgerMode, setLedgerMode] = useState<LedgerMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [adjustMode, setAdjustMode] = useState<"add" | "deduct">("add");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [importRows, setImportRows] = useState<ImportPointRow[]>([]);
  const [importingBaselines, setImportingBaselines] = useState(false);
  const [importPreviewName, setImportPreviewName] = useState("");

  const [testAmount, setTestAmount] = useState("");
  const [testOrderNo, setTestOrderNo] = useState("");
  const [testRemark, setTestRemark] = useState("管理员测试订单");
  const [testCouponId, setTestCouponId] = useState("");
  const [testPackageId, setTestPackageId] = useState("1");
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [issueToSdk, setIssueToSdk] = useState(false);
  const [sdkConfirm, setSdkConfirm] = useState("");
  const [creatingTestOrder, setCreatingTestOrder] = useState(false);

  const [couponTitle, setCouponTitle] = useState("云币充值优惠券");
  const [couponDescription, setCouponDescription] = useState("适用于云币充值的优惠券。");
  const [couponDiscountType, setCouponDiscountType] = useState<"amount" | "percent">("amount");
  const [couponDiscountValue, setCouponDiscountValue] = useState("");
  const [couponMinAmount, setCouponMinAmount] = useState("100");
  const [couponPackageIds, setCouponPackageIds] = useState<number[]>([]);
  const [couponStartsAt, setCouponStartsAt] = useState(toDateTimeInputValue(new Date()));
  const [couponExpiresAt, setCouponExpiresAt] = useState(toDateTimeInputValue(addDays(new Date(), 7)));
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [freezeUntil, setFreezeUntil] = useState(toDateTimeInputValue(addHours(new Date(), 24)));
  const [freezeReason, setFreezeReason] = useState("账户存在异常操作，需要人工复核。");
  const [updatingSecurity, setUpdatingSecurity] = useState(false);
  const [riskEvents, setRiskEvents] = useState<RiskEvent[]>([]);
  const [loadingRiskEvents, setLoadingRiskEvents] = useState(false);

  const frozenPartners = useMemo(
    () => partners.filter((partner) => partner.accountStatus === "frozen"),
    [partners]
  );
  const visiblePartners = activeTab === "frozen" ? frozenPartners : partners;

  const selectedPartner = useMemo(
    () => visiblePartners.find((partner) => partner.id === selectedId) ?? visiblePartners[0] ?? null,
    [selectedId, visiblePartners]
  );

  const activeLedger =
    ledgerMode === "points"
      ? selectedPartner?.pointTransactions ?? []
      : ledgerMode === "coins"
        ? selectedPartner?.coinTransactions ?? []
        : [];

  useEffect(() => {
    void loadPartners();
  }, []);

  useEffect(() => {
    if (visiblePartners.length === 0) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) =>
      current && visiblePartners.some((partner) => partner.id === current)
        ? current
        : visiblePartners[0].id
    );
  }, [visiblePartners]);

  useEffect(() => {
    if (!selectedPartner) {
      setCoupons([]);
      setTestCouponId("");
      setRiskEvents([]);
      return;
    }

    void loadCoupons(selectedPartner.id);
    if (activeTab === "security") {
      void loadRiskEvents(selectedPartner.id);
    }
  }, [selectedPartner?.id]);

  useEffect(() => {
    if (activeTab === "security" && selectedPartner) {
      void loadRiskEvents(selectedPartner.id);
    }
  }, [activeTab, selectedPartner?.id]);

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

      const res = await fetch(adminPath(`/api/admin/partners?${search.toString()}`), { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to fetch partners");
      }

      const nextPartners = (json?.partners ?? []) as PartnerRecord[];
      setPartners(nextPartners);
      setTotalPartners(Number(json?.totalPartners ?? 0));
      setSelectedIds((current) => current.filter((id) => nextPartners.some((partner) => partner.id === id)));
      setSelectedId((current) =>
        current && nextPartners.some((partner) => partner.id === current)
          ? current
          : nextPartners[0]?.id ?? null
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to fetch partners");
    } finally {
      setLoading(false);
    }
  }

  async function loadCoupons(userId: string) {
    try {
      const res = await fetch(adminPath(`/api/admin/coupons?userId=${encodeURIComponent(userId)}`), {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        return;
      }

      const nextCoupons = Array.isArray(json?.coupons) ? json.coupons as CouponItem[] : [];
      setCoupons(nextCoupons);
      setTestCouponId((current) =>
        current && nextCoupons.some((coupon) => coupon.id === current && coupon.status === "unused")
          ? current
          : ""
      );
    } catch {
      setCoupons([]);
    }
  }

  async function loadRiskEvents(userId: string) {
    setLoadingRiskEvents(true);
    try {
      const res = await fetch(adminPath(`/api/admin/partners/${encodeURIComponent(userId)}/risk-events`), {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to fetch risk events");
      }

      setRiskEvents(Array.isArray(json?.events) ? json.events as RiskEvent[] : []);
    } catch {
      setRiskEvents([]);
    } finally {
      setLoadingRiskEvents(false);
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
    setSelectedIds(checked ? visiblePartners.map((partner) => partner.id) : []);
  }

  function getTargetUserIds() {
    if (selectedIds.length > 0) {
      return selectedIds;
    }

    return selectedPartner ? [selectedPartner.id] : [];
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

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setMessage("");
    setImportRows([]);
    setImportPreviewName(file?.name ?? "");

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const rows = parseImportPointRows(text);
      if (rows.length === 0) {
        throw new Error("文件里没有可导入的数据。请使用 uid,points,partner_code 格式。");
      }
      setImportRows(rows);
      setMessage(`已读取 ${rows.length} 条导入数据，请确认后执行导入。`);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "文件读取失败。");
    } finally {
      event.target.value = "";
    }
  }

  async function handleImportBaselines() {
    setError("");
    setMessage("");

    if (importRows.length === 0) {
      setError("请先选择 CSV 文件。");
      return;
    }

    setImportingBaselines(true);
    try {
      const res = await fetch(adminPath("/api/admin/partners"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import-point-baselines",
          rows: importRows,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message ?? "积分导入失败。");
      }

      setMessage(`积分导入完成：成功 ${json?.updatedCount ?? 0} 个，失败 ${json?.failedCount ?? 0} 个。`);
      await loadPartners({ q: query, month });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "积分导入失败。");
    } finally {
      setImportingBaselines(false);
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

    if (!testCouponId && (!Number.isFinite(amount) || amount <= 0)) {
      setError("请输入大于 0 的测试订单金额。");
      return;
    }

    setCreatingTestOrder(true);
    try {
      const res = await fetch(adminPath(testCouponId ? "/api/admin/coupons/test-order" : "/api/admin/partners"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          testCouponId
            ? {
                userId: selectedPartner.id,
                couponId: testCouponId,
                packageId: Number(testPackageId),
                issueToSdk,
                sdkConfirm,
                orderNo: testOrderNo,
                remark: testRemark || "管理员优惠券测试订单",
              }
            : {
                userId: selectedPartner.id,
                amount,
                issueToSdk,
                sdkConfirm,
                orderNo: testOrderNo,
                remark: testRemark,
              }
        ),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message ?? "测试订单创建失败。");
      }

      setMessage(
        testCouponId
          ? `优惠券测试订单已创建：${json?.orderNo ?? ""}，实付 ¥${json?.paidAmount ?? "-"}，增加 ${Number(json?.awardedPoints ?? 0).toLocaleString()} 积分。`
          : `测试订单已创建：${json?.orderNo ?? ""}，增加 ${Number(json?.awardedPoints ?? 0).toLocaleString()} 积分。`
      );
      setTestAmount("");
      setTestOrderNo("");
      setTestRemark("管理员测试订单");
      setTestCouponId("");
      setIssueToSdk(false);
      setSdkConfirm("");
      await loadPartners({ q: query, month });
      await loadCoupons(selectedPartner.id);
      setLedgerMode("points");
    } catch (testOrderError) {
      setError(testOrderError instanceof Error ? testOrderError.message : "测试订单创建失败。");
    } finally {
      setCreatingTestOrder(false);
    }
  }

  async function handleCreateCoupon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const userIds = getTargetUserIds();
    const discountValue = Number(couponDiscountValue);
    const minAmount = Number(couponMinAmount);

    if (userIds.length === 0) {
      setError("请选择至少一个合伙人。");
      return;
    }

    if (!couponTitle.trim()) {
      setError("请输入优惠券名称。");
      return;
    }

    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setError("请输入有效的优惠金额或折扣比例。");
      return;
    }

    if (couponDiscountType === "percent" && discountValue > 100) {
      setError("百分比折扣不能超过 100%。");
      return;
    }

    if (!couponExpiresAt) {
      setError("请选择到期时间。");
      return;
    }

    setCreatingCoupon(true);
    try {
      const res = await fetch(adminPath("/api/admin/coupons"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds,
          title: couponTitle,
          description: couponDescription,
          discountType: couponDiscountType,
          discountValue,
          minAmount,
          packageIds: couponPackageIds,
          startsAt: couponStartsAt,
          expiresAt: couponExpiresAt,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message ?? "优惠券创建失败。");
      }

      setMessage(`优惠券已创建：共发放 ${json?.count ?? 0} 张。`);
      setCouponDiscountValue("");
    } catch (couponError) {
      setError(couponError instanceof Error ? couponError.message : "优惠券创建失败。");
    } finally {
      setCreatingCoupon(false);
    }
  }

  async function handleFreezeAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!selectedPartner) {
      setError("请选择一个合伙人。");
      return;
    }

    if (!freezeUntil) {
      setError("请选择冻结结束时间。");
      return;
    }

    if (!freezeReason.trim()) {
      setError("请输入冻结原因。");
      return;
    }

    setUpdatingSecurity(true);
    try {
      const res = await fetch(adminPath("/api/admin/partners"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "freeze",
          userId: selectedPartner.id,
          frozenUntil: freezeUntil,
          reason: freezeReason,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message ?? "账号冻结失败。");
      }

      setMessage("账号已冻结。");
      await loadPartners({ q: query, month });
    } catch (securityError) {
      setError(securityError instanceof Error ? securityError.message : "账号冻结失败。");
    } finally {
      setUpdatingSecurity(false);
    }
  }

  async function handleUnfreezeAccount() {
    setError("");
    setMessage("");

    if (!selectedPartner) {
      setError("请选择一个合伙人。");
      return;
    }

    setUpdatingSecurity(true);
    try {
      const res = await fetch(adminPath("/api/admin/partners"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unfreeze",
          userId: selectedPartner.id,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message ?? "账号解冻失败。");
      }

      setMessage("账号已解冻。");
      await loadPartners({ q: query, month });
    } catch (securityError) {
      setError(securityError instanceof Error ? securityError.message : "账号解冻失败。");
    } finally {
      setUpdatingSecurity(false);
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
            style={{ ...tabButtonStyle, ...(activeTab === tab.key ? activeTabButtonStyle : null) }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="partners-layout" style={pageGridStyle}>
        <section style={panelStyle}>
          <div style={toolbarStyle}>
            <div>
              <div style={eyebrowStyle}>Partner Count</div>
              <strong style={countStyle}>
                {(activeTab === "frozen" ? frozenPartners.length : totalPartners).toLocaleString()}
              </strong>
              <span style={mutedTextStyle}>{activeTab === "frozen" ? " 冻结账号" : " 合伙人"}</span>
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
              <button type="submit" style={primaryButtonStyle}>查询</button>
            </form>
          </div>

          {error ? <div style={errorStyle}>{error}</div> : null}
          {message ? <div style={successStyle}>{message}</div> : null}

          {activeTab === "points" ? (
            <form onSubmit={handleAdjustPoints} style={utilityPanelStyle}>
              <PanelTitle eyebrow="Manual Points" title="管理员积分调整" description={`已选择 ${selectedIds.length} 个合伙人`} />
              <div style={buttonGroupStyle}>
                <button type="button" onClick={() => setAdjustMode("add")} style={{ ...modeButtonStyle, ...(adjustMode === "add" ? activeModeButtonStyle : null) }}>增加</button>
                <button type="button" onClick={() => setAdjustMode("deduct")} style={{ ...modeButtonStyle, ...(adjustMode === "deduct" ? activeModeButtonStyle : null) }}>扣减</button>
              </div>
              <div style={formGridStyle}>
                <input type="number" min="1" value={adjustAmount} onChange={(event) => setAdjustAmount(event.target.value)} placeholder="积分数量" style={compactInputStyle} />
                <input value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="调整原因" style={compactInputStyle} />
                <button type="submit" disabled={adjusting} style={primaryButtonStyle}>{adjusting ? "处理中..." : "提交调整"}</button>
              </div>
            </form>
          ) : null}

          {activeTab === "import-baseline" ? (
            <div style={utilityPanelStyle}>
              <PanelTitle
                eyebrow="Point Import"
                title="导入积分基准"
                description="上传后会强制设置用户当前积分，并从上传时间之后才开始计算新的充值积分。"
              />
              <div style={formGridStyle}>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleImportFile}
                  style={compactInputStyle}
                />
                <button
                  type="button"
                  disabled={importingBaselines || importRows.length === 0}
                  onClick={handleImportBaselines}
                  style={primaryButtonStyle}
                >
                  {importingBaselines ? "导入中..." : "确认导入"}
                </button>
              </div>
              <div style={mutedTextStyle}>
                支持表头：uid, username, points, partner_code。只会更新已经在本站注册且能匹配到 UID 或账号的用户。
              </div>
              {importRows.length > 0 ? (
                <div style={importPreviewStyle}>
                  <strong>{importPreviewName || "导入预览"}</strong>
                  <div style={mutedTextStyle}>
                    共 {importRows.length} 条，前 5 条：
                    {importRows.slice(0, 5).map((row) => (
                      <span key={`${row.uid}-${row.username}-${row.points}`} style={importPreviewRowStyle}>
                        UID {row.uid || "-"} / 账号 {row.username || "-"} / 积分 {row.points.toLocaleString()} / 编码 {row.partnerCode || "-"}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "coupons" ? (
            <form onSubmit={handleCreateCoupon} style={utilityPanelStyle}>
              <PanelTitle
                eyebrow="Coupons"
                title="发放优惠券"
                description={selectedIds.length > 0 ? `将发放给已勾选的 ${selectedIds.length} 个合伙人` : `将发放给当前选中的合伙人：${selectedPartner?.partnerCode ?? "-"}`}
              />
              <div style={couponFormGridStyle}>
                <input value={couponTitle} onChange={(event) => setCouponTitle(event.target.value)} placeholder="优惠券名称" style={compactInputStyle} />
                <input value={couponDescription} onChange={(event) => setCouponDescription(event.target.value)} placeholder="说明" style={compactInputStyle} />
                <select value={couponDiscountType} onChange={(event) => setCouponDiscountType(event.target.value === "percent" ? "percent" : "amount")} style={selectStyle}>
                  <option value="amount">固定金额立减</option>
                  <option value="percent">百分比折扣</option>
                </select>
                <input type="number" min="0.01" step="0.01" value={couponDiscountValue} onChange={(event) => setCouponDiscountValue(event.target.value)} placeholder={couponDiscountType === "percent" ? "折扣比例，如 20" : "优惠金额，如 10"} style={compactInputStyle} />
                <input type="number" min="0" step="0.01" value={couponMinAmount} onChange={(event) => setCouponMinAmount(event.target.value)} placeholder="最低消费金额" style={compactInputStyle} />
                <input type="datetime-local" value={couponStartsAt} onChange={(event) => setCouponStartsAt(event.target.value)} style={compactInputStyle} />
                <input type="datetime-local" value={couponExpiresAt} onChange={(event) => setCouponExpiresAt(event.target.value)} style={compactInputStyle} />
              </div>
              <div style={packageGridStyle}>
                {packageOptions.map((item) => (
                  <label key={item.id} style={checkLabelStyle}>
                    <input
                      type="checkbox"
                      checked={couponPackageIds.includes(item.id)}
                      onChange={(event) => {
                        setCouponPackageIds((current) =>
                          event.target.checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id)
                        );
                      }}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
              <div style={mutedTextStyle}>不勾选商品时，优惠券适用于所有满足金额条件的云币商品。</div>
              <button type="submit" disabled={creatingCoupon} style={primaryButtonStyle}>{creatingCoupon ? "创建中..." : "发放优惠券"}</button>
            </form>
          ) : null}

          {loading ? (
            <div style={emptyStyle}>加载合伙人数据...</div>
          ) : visiblePartners.length === 0 ? (
            <div style={emptyStyle}>{activeTab === "frozen" ? "暂无冻结账号。" : "暂无匹配的合伙人。"}</div>
          ) : (
            <div className="admin-table-wrap" style={tableWrapStyle}>
              <table className="admin-data-table" style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>
                      <input
                        type="checkbox"
                        checked={visiblePartners.length > 0 && selectedIds.length === visiblePartners.length}
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
                    <th style={thStyle}>累计充值</th>
                    <th style={thStyle}>状态</th>
                    <th style={thStyle}>实名认证</th>
                    <th style={thStyle}>手机号</th>
                    <th style={thStyle}>最近登录</th>
                    {activeTab === "frozen" ? (
                      <>
                        <th style={thStyle}>冻结开始</th>
                        <th style={thStyle}>冻结结束</th>
                        <th style={thStyle}>类型</th>
                        <th style={thStyle}>操作人</th>
                        <th style={thStyle}>原因</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {visiblePartners.map((partner) => {
                    const active = selectedPartner?.id === partner.id;
                    return (
                      <tr
                        key={partner.id}
                        onClick={() => {
                          setSelectedId(partner.id);
                          setLedgerMode(null);
                        }}
                        style={{ ...trStyle, ...(active ? activeTrStyle : null) }}
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
                        <td style={tdStyle}>{formatMoney(partner.totalRechargeAmount)}</td>
                        <td style={tdStyle}><AccountStatusBadge partner={partner} /></td>
                        <td style={tdStyle}>{partner.realNameVerified ? "已认证" : "未认证"}</td>
                        <td style={tdStyle}>{partner.maskedPhone || "-"}</td>
                        <td style={tdStyle}>{formatDate(partner.lastSignInAt)}</td>
                        {activeTab === "frozen" ? (
                          <>
                            <td style={tdStyle}>{formatDate(partner.frozenAt)}</td>
                            <td style={tdStyle}>{formatDate(partner.frozenUntil)}</td>
                            <td style={tdStyle}>{partner.frozenSource === "auto" ? "自动" : "手动"}</td>
                            <td style={tdStyle}>{partner.frozenBy || "-"}</td>
                            <td style={reasonCellStyle}>{partner.frozenReason || "-"}</td>
                          </>
                        ) : null}
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
                <Metric label="导入基准" value={selectedPartner.importMode === "override" ? `${selectedPartner.importBaselinePoints.toLocaleString()} 分` : "-"} />
                <Metric label="基准时间" value={selectedPartner.importMode === "override" ? formatDate(selectedPartner.importBaselineAt) : "-"} />
                <Metric label="当前星级" value={selectedPartner.tier.label} />
                <Metric label="当前云币" value={selectedPartner.cloudCoins.toLocaleString()} />
                <Metric label="累计充值金额" value={formatMoney(selectedPartner.totalRechargeAmount)} />
                <Metric label="账号状态" value={selectedPartner.accountStatus === "frozen" ? `冻结至 ${formatDate(selectedPartner.frozenUntil)}` : "正常"} />
                <Metric label="冻结开始" value={selectedPartner.accountStatus === "frozen" ? formatDate(selectedPartner.frozenAt) : "-"} />
                <Metric label="冻结类型" value={selectedPartner.accountStatus === "frozen" ? (selectedPartner.frozenSource === "auto" ? "自动" : "手动") : "-"} />
                <Metric label="冻结原因" value={selectedPartner.accountStatus === "frozen" ? selectedPartner.frozenReason || "-" : "-"} />
                <Metric label="实名认证" value={selectedPartner.realNameVerified ? "已认证" : "未认证"} />
                <Metric label="手机号" value={selectedPartner.maskedPhone || "-"} />
                <Metric label="最近接入日" value={formatDate(selectedPartner.lastSignInAt)} />
                <Metric label="账号" value={selectedPartner.username || selectedPartner.email || "-"} />
              </div>

              <div style={actionRowStyle}>
                <button type="button" onClick={() => setLedgerMode("points")} style={secondaryButtonStyle}>查看积分明细</button>
                <button type="button" onClick={() => setLedgerMode("coins")} style={secondaryButtonStyle}>查看云币明细</button>
              </div>

              {activeTab === "test-order" ? (
                <form onSubmit={handleCreateTestOrder} style={utilityPanelStyle}>
                  <PanelTitle eyebrow="Test Order" title="创建测试订单" description="可创建普通测试订单，也可以选择未使用优惠券模拟一次优惠券支付。" />
                  <div style={formGridStyle}>
                    <select value={testCouponId} onChange={(event) => setTestCouponId(event.target.value)} style={selectStyle}>
                      <option value="">不使用优惠券</option>
                      {coupons
                        .filter((coupon) => coupon.status === "unused")
                        .map((coupon) => (
                          <option key={coupon.id} value={coupon.id}>
                            {coupon.title} / {renderCouponDiscount(coupon)} / {coupon.code}
                          </option>
                        ))}
                    </select>
                    {testCouponId ? (
                      <select value={testPackageId} onChange={(event) => setTestPackageId(event.target.value)} style={selectStyle}>
                        {packageOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input type="number" min="1" value={testAmount} onChange={(event) => setTestAmount(event.target.value)} placeholder="订单金额 / 云币" style={compactInputStyle} />
                    )}
                    <input value={testOrderNo} onChange={(event) => setTestOrderNo(event.target.value)} placeholder="测试订单号，可留空自动生成" style={compactInputStyle} />
                    <input value={testRemark} onChange={(event) => setTestRemark(event.target.value)} placeholder="订单备注" style={compactInputStyle} />
                    <label style={sdkIssueToggleStyle}>
                      <input
                        type="checkbox"
                        checked={issueToSdk}
                        onChange={(event) => {
                          setIssueToSdk(event.target.checked);
                          if (!event.target.checked) {
                            setSdkConfirm("");
                          }
                        }}
                      />
                      同时真实发放到 QuickSDK 钱包
                    </label>
                    {issueToSdk ? (
                      <input
                        value={sdkConfirm}
                        onChange={(event) => setSdkConfirm(event.target.value)}
                        placeholder="输入 CONFIRM 确认真实发放"
                        style={dangerInputStyle}
                      />
                    ) : null}
                    <button type="submit" disabled={creatingTestOrder} style={primaryButtonStyle}>{creatingTestOrder ? "创建中..." : testCouponId ? "创建优惠券测试订单" : "创建测试订单"}</button>
                  </div>
                  {testCouponId ? (
                    <div style={mutedTextStyle}>优惠券测试订单会将所选优惠券标记为已使用，并按折后实付金额发放 MIR 积分。</div>
                  ) : null}
                  {issueToSdk ? (
                    <div style={dangerTextStyle}>注意：该操作会真实增加用户 QuickSDK 钱包余额，不能自动撤销。</div>
                  ) : null}
                </form>
              ) : null}

              {activeTab === "security" ? (
                <form onSubmit={handleFreezeAccount} style={utilityPanelStyle}>
                  <PanelTitle
                    eyebrow="Account Risk"
                    title="账号冻结"
                    description="冻结后用户将无法进入个人中心、钱包、积分活动、优惠券、支付和小游戏接口。"
                  />
                  <div style={formGridStyle}>
                    <input
                      type="datetime-local"
                      value={freezeUntil}
                      onChange={(event) => setFreezeUntil(event.target.value)}
                      style={compactInputStyle}
                    />
                    <input
                      value={freezeReason}
                      onChange={(event) => setFreezeReason(event.target.value)}
                      placeholder="冻结原因"
                      style={compactInputStyle}
                    />
                    <button type="submit" disabled={updatingSecurity} style={dangerButtonStyle}>
                      {updatingSecurity ? "处理中..." : "冻结账号"}
                    </button>
                  </div>
                  <div style={securitySummaryStyle}>
                    <div>
                      <strong>当前状态</strong>
                      <div style={mutedTextStyle}>
                        {selectedPartner.accountStatus === "frozen"
                          ? `已冻结至 ${formatDate(selectedPartner.frozenUntil)}`
                          : "正常"}
                      </div>
                      {selectedPartner.frozenReason ? (
                        <div style={mutedTextStyle}>原因：{selectedPartner.frozenReason}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={updatingSecurity || selectedPartner.accountStatus !== "frozen"}
                      onClick={handleUnfreezeAccount}
                      style={secondaryButtonStyle}
                    >
                      解除冻结
                    </button>
                  </div>
                  <div style={riskHeaderStyle}>
                    <strong>最近风控事件</strong>
                    <button
                      type="button"
                      onClick={() => void loadRiskEvents(selectedPartner.id)}
                      style={secondaryButtonStyle}
                    >
                      刷新
                    </button>
                  </div>
                  {loadingRiskEvents ? (
                    <div style={emptyStyle}>加载风控事件...</div>
                  ) : riskEvents.length === 0 ? (
                    <div style={emptyStyle}>暂无风控事件。</div>
                  ) : (
                    <div style={riskListStyle}>
                      {riskEvents.map((event) => (
                        <div key={event.id} style={riskItemStyle}>
                          <div>
                            <div style={riskTitleStyle}>
                              <span style={riskSeverityStyle(event.severity)}>{event.severity}</span>
                              {event.eventType}
                            </div>
                            <div style={mutedTextStyle}>
                              {event.source} · {formatDate(event.createdAt)} · score {event.score}
                            </div>
                            <div style={mutedTextStyle}>
                              IP {event.ipAddress || "-"} · {formatRiskDetails(event.details)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              ) : null}
            </>
          ) : (
            <div style={emptyStyle}>请选择一个合伙人。</div>
          )}
        </aside>
      </div>

      {ledgerMode ? (
        <div style={modalOverlayStyle} onClick={() => setLedgerMode(null)}>
          <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>{selectedPartner?.partnerCode ?? "-"}</div>
                <h3 style={modalTitleStyle}>{ledgerMode === "points" ? "积分明细" : "云币明细"}</h3>
              </div>
              <button type="button" onClick={() => setLedgerMode(null)} style={closeButtonStyle}>关闭</button>
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

function PanelTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <div style={eyebrowStyle}>{eyebrow}</div>
      <strong>{title}</strong>
      <div style={mutedTextStyle}>{description}</div>
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

function AccountStatusBadge({ partner }: { partner: PartnerRecord }) {
  const frozen = partner.accountStatus === "frozen";

  return (
    <span style={frozen ? frozenBadgeStyle : activeBadgeStyle}>
      {frozen ? "冻结" : "正常"}
    </span>
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

function formatMoney(value: number) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeTab(value: string | null): PartnerTab {
  return value === "frozen" ||
    value === "points" ||
    value === "import-baseline" ||
    value === "test-order" ||
    value === "coupons" ||
    value === "security"
    ? value
    : "list";
}

function renderCouponDiscount(coupon: CouponItem) {
  return coupon.discountType === "percent"
    ? `${coupon.discountValue}% 折扣`
    : `立减 ¥${coupon.discountValue}`;
}

function parseImportPointRows(text: string): ImportPointRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const firstCells = splitDelimitedLine(lines[0], delimiter).map((cell) => cell.trim().toLowerCase());
  const hasHeader = firstCells.some((cell) =>
    ["uid", "quicksdk_uid", "username", "account", "points", "mir_points", "partner_code"].includes(cell)
  );
  const headers = hasHeader ? firstCells : ["uid", "points", "partner_code", "username"];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const cells = splitDelimitedLine(line, delimiter);
      const source = new Map<string, string>();
      headers.forEach((header, index) => source.set(header, cells[index]?.trim() ?? ""));

      const uid = source.get("uid") || source.get("quicksdk_uid") || source.get("quick_uid") || "";
      const username = source.get("username") || source.get("account") || source.get("login_name") || "";
      const points = Number(source.get("points") || source.get("mir_points") || source.get("point") || "0");
      const partnerCode = source.get("partner_code") || source.get("partnercode") || source.get("code") || "";

      return {
        uid,
        username,
        partnerCode,
        points: Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0,
      };
    })
    .filter((row) => (row.uid || row.username) && row.points >= 0);
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function formatRiskDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details ?? {}).slice(0, 4);
  if (entries.length === 0) {
    return "-";
  }

  return entries
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" / ");
}

function riskSeverityStyle(severity: RiskEvent["severity"]): React.CSSProperties {
  const background =
    severity === "critical"
      ? "rgba(220,38,38,0.22)"
      : severity === "high"
        ? "rgba(249,115,22,0.2)"
        : severity === "medium"
          ? "rgba(234,179,8,0.18)"
          : "rgba(34,197,94,0.16)";
  const color =
    severity === "critical"
      ? "#fecaca"
      : severity === "high"
        ? "#fed7aa"
        : severity === "medium"
          ? "#fef3c7"
          : "#bbf7d0";

  return {
    borderRadius: "999px",
    padding: "4px 8px",
    background,
    color,
    fontSize: "12px",
    fontWeight: 900,
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function toDateTimeInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

const tabsStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" };
const tabButtonStyle: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "11px 14px", background: "rgba(255,255,255,0.04)", color: "#d1d5db", fontWeight: 800, cursor: "pointer" };
const activeTabButtonStyle: React.CSSProperties = { background: "linear-gradient(90deg, rgba(124,58,237,0.24), rgba(168,85,247,0.18))", border: "1px solid rgba(192,132,252,0.3)", color: "#fff" };
const pageGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(360px, 0.65fr)", gap: "18px", alignItems: "start" };
const panelStyle: React.CSSProperties = { padding: "20px", borderRadius: "24px", background: "rgba(16,16,24,0.82)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 18px 38px rgba(0,0,0,0.28)" };
const toolbarStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" };
const eyebrowStyle: React.CSSProperties = { color: "#c084fc", fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" };
const countStyle: React.CSSProperties = { fontSize: "32px" };
const mutedTextStyle: React.CSSProperties = { color: "#9ca3af", fontSize: "13px", lineHeight: 1.6 };
const searchFormStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap" };
const inputStyle: React.CSSProperties = { minWidth: "240px", height: "42px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "0 12px", outline: "none" };
const monthInputStyle: React.CSSProperties = { ...inputStyle, minWidth: "150px" };
const compactInputStyle: React.CSSProperties = { height: "42px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "0 12px", outline: "none", minWidth: 0 };
const selectStyle: React.CSSProperties = { ...compactInputStyle, colorScheme: "dark", backgroundColor: "#181824", color: "#fff" };
const dangerInputStyle: React.CSSProperties = { ...compactInputStyle, border: "1px solid rgba(248,113,113,0.45)", background: "rgba(127,29,29,0.18)" };
const sdkIssueToggleStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", minHeight: "42px", padding: "0 12px", borderRadius: "12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(248,113,113,0.24)", color: "#fecaca", fontWeight: 800 };
const dangerTextStyle: React.CSSProperties = { color: "#fecaca", fontSize: "13px", lineHeight: 1.6 };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: "12px", padding: "0 16px", minHeight: "42px", background: "linear-gradient(90deg, #7c3aed, #a855f7)", color: "#fff", fontWeight: 800, cursor: "pointer" };
const dangerButtonStyle: React.CSSProperties = { border: "none", borderRadius: "12px", padding: "0 16px", minHeight: "42px", background: "linear-gradient(90deg, #dc2626, #f97316)", color: "#fff", fontWeight: 800, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { border: "1px solid rgba(192,132,252,0.28)", borderRadius: "12px", padding: "10px 12px", background: "rgba(124,58,237,0.12)", color: "#f5d0fe", fontWeight: 800, cursor: "pointer" };
const errorStyle: React.CSSProperties = { padding: "12px", borderRadius: "12px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(248,113,113,0.22)", color: "#fecaca", marginBottom: "12px" };
const successStyle: React.CSSProperties = { padding: "12px", borderRadius: "12px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(74,222,128,0.22)", color: "#bbf7d0", marginBottom: "12px" };
const utilityPanelStyle: React.CSSProperties = { padding: "14px", borderRadius: "18px", background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)", display: "grid", gap: "12px", marginBottom: "16px" };
const buttonGroupStyle: React.CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap" };
const modeButtonStyle: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "10px 12px", background: "rgba(255,255,255,0.04)", color: "#d1d5db", fontWeight: 800, cursor: "pointer" };
const activeModeButtonStyle: React.CSSProperties = { background: "rgba(124,58,237,0.24)", border: "1px solid rgba(192,132,252,0.35)", color: "#fff" };
const formGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" };
const couponFormGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" };
const packageGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px" };
const checkLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", color: "#e5e7eb", padding: "9px 10px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" };
const securitySummaryStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", padding: "12px", borderRadius: "14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" };
const importPreviewStyle: React.CSSProperties = { padding: "12px", borderRadius: "14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", display: "grid", gap: "8px" };
const importPreviewRowStyle: React.CSSProperties = { display: "block", marginTop: "4px", color: "#d1d5db" };
const riskHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" };
const riskListStyle: React.CSSProperties = { display: "grid", gap: "10px" };
const riskItemStyle: React.CSSProperties = { padding: "12px", borderRadius: "14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" };
const riskTitleStyle: React.CSSProperties = { display: "flex", gap: "8px", alignItems: "center", color: "#fff", fontWeight: 900, marginBottom: "6px", flexWrap: "wrap" };
const emptyStyle: React.CSSProperties = { padding: "22px", borderRadius: "16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#9ca3af", textAlign: "center" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { padding: "12px", textAlign: "left", color: "#9ca3af", fontSize: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "12px", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#e5e7eb", whiteSpace: "nowrap" };
const tdStrongStyle: React.CSSProperties = { ...tdStyle, color: "#fff", fontWeight: 800 };
const reasonCellStyle: React.CSSProperties = { ...tdStyle, maxWidth: "320px", whiteSpace: "normal", lineHeight: 1.5 };
const trStyle: React.CSSProperties = { cursor: "pointer" };
const activeTrStyle: React.CSSProperties = { background: "rgba(124,58,237,0.12)" };
const detailHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", marginBottom: "16px" };
const detailTitleStyle: React.CSSProperties = { margin: "8px 0 0", fontSize: "28px" };
const badgeStyle: React.CSSProperties = { borderRadius: "999px", padding: "8px 10px", background: "rgba(255,255,255,0.06)", color: "#e5e7eb", fontSize: "13px", fontWeight: 800 };
const metricGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" };
const metricStyle: React.CSSProperties = { padding: "12px", borderRadius: "14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" };
const metricLabelStyle: React.CSSProperties = { color: "#9ca3af", fontSize: "12px" };
const metricValueStyle: React.CSSProperties = { marginTop: "6px", color: "#fff", fontSize: "16px", fontWeight: 800, overflowWrap: "anywhere" };
const actionRowStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "16px", marginBottom: "16px" };
const modalOverlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 30, padding: "24px", display: "grid", placeItems: "center" };
const modalStyle: React.CSSProperties = { width: "min(760px, 100%)", maxHeight: "82vh", overflowY: "auto", borderRadius: "22px", background: "#11111a", border: "1px solid rgba(255,255,255,0.08)", padding: "22px" };
const modalHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "16px" };
const modalTitleStyle: React.CSSProperties = { margin: "6px 0 0", fontSize: "24px" };
const closeButtonStyle: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "10px 12px", background: "rgba(255,255,255,0.04)", color: "#fff", fontWeight: 800, cursor: "pointer" };
const ledgerListStyle: React.CSSProperties = { display: "grid", gap: "10px" };
const ledgerItemStyle: React.CSSProperties = { padding: "14px", borderRadius: "14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center" };
const dateTextStyle: React.CSSProperties = { color: "#6b7280", fontSize: "12px", marginTop: "4px" };
const amountStyle: React.CSSProperties = { color: "#86efac", fontWeight: 900, fontSize: "18px" };
const deductAmountStyle: React.CSSProperties = { color: "#fca5a5", fontWeight: 900, fontSize: "18px" };
const activeBadgeStyle: React.CSSProperties = { borderRadius: "999px", padding: "5px 9px", background: "rgba(34,197,94,0.14)", color: "#bbf7d0", fontWeight: 900, fontSize: "12px" };
const frozenBadgeStyle: React.CSSProperties = { borderRadius: "999px", padding: "5px 9px", background: "rgba(239,68,68,0.14)", color: "#fecaca", fontWeight: 900, fontSize: "12px" };
