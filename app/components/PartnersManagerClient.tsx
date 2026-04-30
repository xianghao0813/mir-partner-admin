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
type PartnerTab = "list" | "points" | "test-order" | "coupons";

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

const partnerTabs: { key: PartnerTab; label: string }[] = [
  { key: "list", label: "合伙人列表" },
  { key: "points", label: "积分调整" },
  { key: "test-order", label: "测试订单" },
  { key: "coupons", label: "优惠券" },
];

const packageOptions = [
  { id: 1, label: "100 云币" },
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

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedId) ?? partners[0] ?? null,
    [partners, selectedId]
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
    if (!selectedPartner) {
      setCoupons([]);
      setTestCouponId("");
      return;
    }

    void loadCoupons(selectedPartner.id);
  }, [selectedPartner?.id]);

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
  return value === "points" || value === "test-order" || value === "coupons" ? value : "list";
}

function renderCouponDiscount(coupon: CouponItem) {
  return coupon.discountType === "percent"
    ? `${coupon.discountValue}% 折扣`
    : `立减 ¥${coupon.discountValue}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
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
const emptyStyle: React.CSSProperties = { padding: "22px", borderRadius: "16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#9ca3af", textAlign: "center" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { padding: "12px", textAlign: "left", color: "#9ca3af", fontSize: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "12px", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#e5e7eb", whiteSpace: "nowrap" };
const tdStrongStyle: React.CSSProperties = { ...tdStyle, color: "#fff", fontWeight: 800 };
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
