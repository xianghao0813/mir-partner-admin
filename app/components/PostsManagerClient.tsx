"use client";

import { useEffect, useMemo, useState } from "react";
import { adminPath } from "@/lib/paths";

type Notice = {
  id: number;
  title: string;
  content: string;
  author: string;
  views: number;
  category: "latest" | "events" | "updates";
  gameSlug: string;
  thumbnailUrl: string;
  showOnHome: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  publishMode: "draft" | "publish" | "scheduled";
};

type Props = {
  currentAdminEmail: string;
};

const gameOptions = [
  { value: "", label: "不指定" },
  { value: "mir4", label: "MIR4" },
  { value: "mirm", label: "MIR M" },
  { value: "night-crows", label: "Night Crows" },
  { value: "legend-of-ymir", label: "Legend of YMIR" },
];

const categoryLabelMap = {
  latest: "最新消息",
  events: "活动",
  updates: "更新",
} as const;

const publishModeLabelMap = {
  draft: "草稿",
  publish: "已发布",
  scheduled: "预约发布",
} as const;

const filterTabs = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "publish", label: "已发布" },
  { key: "scheduled", label: "预约发布" },
] as const;

type FilterTab = (typeof filterTabs)[number]["key"];

export default function PostsManagerClient({ currentAdminEmail }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState(currentAdminEmail);
  const [category, setCategory] = useState<Notice["category"]>("latest");
  const [gameSlug, setGameSlug] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [showOnHome, setShowOnHome] = useState(true);
  const [publishMode, setPublishMode] = useState<Notice["publishMode"]>("publish");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [previewNoticeId, setPreviewNoticeId] = useState<number | null>(null);

  useEffect(() => {
    void loadNotices();
  }, []);

  async function loadNotices() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(adminPath("/api/admin/notices"), { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to fetch notices");
      }

      const nextNotices = json?.notices ?? [];
      setNotices(nextNotices);
      setPreviewNoticeId((prev) => prev ?? nextNotices[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to fetch notices");
    } finally {
      setLoading(false);
    }
  }

  function resetComposer() {
    setEditingId(null);
    setTitle("");
    setContent("");
    setAuthor(currentAdminEmail);
    setCategory("latest");
    setGameSlug("");
    setThumbnailUrl("");
    setShowOnHome(true);
    setPublishMode("publish");
    setScheduledAt("");
    setError("");
    setMessage("");
  }

  function startEdit(notice: Notice) {
    setEditingId(notice.id);
    setTitle(notice.title);
    setContent(notice.content);
    setAuthor(notice.author);
    setCategory(notice.category);
    setGameSlug(notice.gameSlug ?? "");
    setThumbnailUrl(notice.thumbnailUrl ?? "");
    setShowOnHome(notice.showOnHome);
    setPublishMode(notice.publishMode);
    setScheduledAt(toDatetimeLocalValue(notice.publishedAt, notice.publishMode));
    setPreviewNoticeId(notice.id);
    setError("");
    setMessage(`正在编辑帖子 ID: ${notice.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: number) {
    if (!window.confirm("确定要删除这篇帖子吗？")) return;

    try {
      const res = await fetch(adminPath(`/api/admin/notices/${id}`), { method: "DELETE" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to delete notice");
      }

      const nextNotices = notices.filter((item) => item.id !== id);
      setNotices(nextNotices);
      setPreviewNoticeId((prev) => {
        if (prev !== id) return prev;
        return nextNotices[0]?.id ?? null;
      });

      if (editingId === id) {
        resetComposer();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete notice");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!title.trim() || !content.trim()) {
      setError("标题和正文不能为空。");
      return;
    }

    if (publishMode === "scheduled" && !scheduledAt) {
      setError("预约发布时必须选择发布时间。");
      return;
    }

    setSubmitting(true);

    try {
      const isEditing = editingId !== null;
      const res = await fetch(
        isEditing ? adminPath(`/api/admin/notices/${editingId}`) : adminPath("/api/admin/notices"),
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            author,
            category,
            gameSlug,
            thumbnailUrl,
            showOnHome,
            publishMode,
            scheduledAt: publishMode === "scheduled" ? new Date(scheduledAt).toISOString() : null,
          }),
        }
      );
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to save notice");
      }

      await loadNotices();
      setMessage(isEditing ? "帖子已更新。" : `帖子已保存，ID: ${json?.id ?? "-"}`);

      if (!isEditing) {
        resetComposer();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save notice");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredNotices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return notices.filter((notice) => {
      if (activeTab !== "all" && notice.publishMode !== activeTab) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [notice.title, notice.author, notice.content]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [activeTab, notices, query]);

  const editingPreview = useMemo(
    () => ({
      id: editingId ?? 0,
      title: title.trim() || "未命名帖子",
      content: content.trim() || "正文预览会显示在这里。",
      author: author.trim() || currentAdminEmail || "未填写作者",
      category,
      gameSlug,
      thumbnailUrl,
      showOnHome,
      publishMode,
      views: 0,
      isPublished: publishMode !== "draft",
      publishedAt:
        publishMode === "scheduled"
          ? scheduledAt
            ? new Date(scheduledAt).toISOString()
            : null
          : publishMode === "publish"
            ? new Date().toISOString()
            : null,
    }),
    [
      author,
      category,
      content,
      currentAdminEmail,
      editingId,
      gameSlug,
      publishMode,
      scheduledAt,
      showOnHome,
      thumbnailUrl,
      title,
    ]
  );

  const selectedPreviewNotice =
    editingId !== null
      ? editingPreview
      : notices.find((notice) => notice.id === previewNoticeId) ?? null;

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section style={editorGridStyle}>
        <div style={panelStyle}>
          <div style={headerRowStyle}>
            <div style={panelTitleStyle}>{editingId ? "编辑帖子" : "发布帖子"}</div>
            {editingId ? (
              <button type="button" onClick={resetComposer} style={ghostButtonStyle}>
                取消编辑
              </button>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="标题"
              style={inputStyle}
            />
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="作者"
              style={inputStyle}
            />

            <div style={twoColStyle}>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Notice["category"])}
                style={inputStyle}
              >
                <option value="latest">最新消息</option>
                <option value="events">活动</option>
                <option value="updates">更新</option>
              </select>
              <select value={gameSlug} onChange={(e) => setGameSlug(e.target.value)} style={inputStyle}>
                {gameOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <input
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="缩略图 URL"
              style={inputStyle}
            />

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="正文"
              style={{ ...inputStyle, minHeight: "220px", resize: "vertical" }}
            />

            <div style={threeColStyle}>
              <select
                value={publishMode}
                onChange={(e) => setPublishMode(e.target.value as Notice["publishMode"])}
                style={inputStyle}
              >
                <option value="draft">草稿</option>
                <option value="publish">立即发布</option>
                <option value="scheduled">预约发布</option>
              </select>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={publishMode !== "scheduled"}
                style={inputStyle}
              />
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={showOnHome}
                  onChange={(e) => setShowOnHome(e.target.checked)}
                />
                <span>首页精选</span>
              </label>
            </div>

            {error ? <div style={errorStyle}>{error}</div> : null}
            {message ? <div style={messageStyle}>{message}</div> : null}

            <button type="submit" disabled={submitting} style={buttonStyle}>
              {submitting ? "保存中..." : editingId ? "保存修改" : "保存帖子"}
            </button>
          </form>
        </div>

        <aside style={panelStyle}>
          <div style={panelTitleStyle}>实时预览</div>
          <PreviewCard notice={selectedPreviewNotice} />
        </aside>
      </section>

      <section style={panelStyle}>
        <div style={headerRowStyle}>
          <div style={panelTitleStyle}>帖子列表</div>
          <button type="button" onClick={() => void loadNotices()} style={ghostButtonStyle}>
            刷新
          </button>
        </div>

        <div style={toolbarStyle}>
          <div style={tabsStyle}>
            {filterTabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    ...tabButtonStyle,
                    ...(active ? activeTabButtonStyle : null),
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题、作者或正文"
            style={{ ...inputStyle, maxWidth: "320px" }}
          />
        </div>

        {loading ? (
          <div style={stateStyle}>正在加载帖子列表...</div>
        ) : filteredNotices.length === 0 ? (
          <div style={stateStyle}>当前筛选条件下没有帖子。</div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {filteredNotices.map((notice) => (
              <article
                key={notice.id}
                style={{
                  ...itemStyle,
                  ...(previewNoticeId === notice.id && editingId === null ? activeItemStyle : null),
                }}
              >
                <div style={itemTitleStyle}>{notice.title}</div>
                <div style={itemMetaStyle}>
                  ID {notice.id} | {categoryLabelMap[notice.category]} | 作者 {notice.author}
                </div>
                <div style={itemMetaStyle}>
                  发布时间 {formatDateTime(notice.publishedAt)} | 浏览 {notice.views.toLocaleString()}
                </div>
                <div style={actionsStyle}>
                  <span style={tagStyle}>{publishModeLabelMap[notice.publishMode]}</span>
                  <span style={tagStyle}>{notice.showOnHome ? "首页精选" : "普通展示"}</span>
                  <button
                    type="button"
                    onClick={() => setPreviewNoticeId(notice.id)}
                    style={ghostButtonStyle}
                  >
                    预览
                  </button>
                  <button type="button" onClick={() => startEdit(notice)} style={ghostButtonStyle}>
                    编辑
                  </button>
                  <button type="button" onClick={() => void handleDelete(notice.id)} style={dangerButtonStyle}>
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PreviewCard({ notice }: { notice: Notice | null }) {
  if (!notice) {
    return <div style={stateStyle}>选中一篇帖子后会在这里显示预览。</div>;
  }

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div style={previewTagsStyle}>
        <span style={tagStyle}>{publishModeLabelMap[notice.publishMode]}</span>
        <span style={tagStyle}>{categoryLabelMap[notice.category]}</span>
        {notice.showOnHome ? <span style={tagStyle}>首页精选</span> : null}
      </div>

      <div style={previewTitleStyle}>{notice.title}</div>

      <div style={previewMetaStyle}>
        作者 {notice.author} | 发布时间 {formatDateTime(notice.publishedAt)}
      </div>

      {notice.thumbnailUrl ? (
        <div style={thumbnailBoxStyle}>
          <img src={notice.thumbnailUrl} alt={notice.title} style={thumbnailStyle} />
        </div>
      ) : (
        <div style={thumbnailPlaceholderStyle}>未设置缩略图</div>
      )}

      {notice.gameSlug ? <div style={previewMetaStyle}>游戏标签：{notice.gameSlug}</div> : null}

      <div style={previewContentStyle}>
        {notice.content.split("\n").map((paragraph, index) => (
          <p key={`${index}-${paragraph}`} style={paragraphStyle}>
            {paragraph || "\u00a0"}
          </p>
        ))}
      </div>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "未设置";
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

function toDatetimeLocalValue(value: string | null, mode: Notice["publishMode"]) {
  if (!value || mode !== "scheduled") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

const editorGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.9fr)",
  gap: "18px",
  alignItems: "start",
};

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

const twoColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
};

const threeColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
  alignItems: "center",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  color: "#e5e7eb",
  fontSize: "14px",
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

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: "14px",
};

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const tabButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "999px",
  padding: "10px 14px",
  background: "rgba(255,255,255,0.03)",
  color: "#e5e7eb",
  fontWeight: 700,
  cursor: "pointer",
};

const activeTabButtonStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(124,58,237,0.22), rgba(168,85,247,0.18))",
  border: "1px solid rgba(192,132,252,0.28)",
  color: "white",
};

const itemStyle: React.CSSProperties = {
  padding: "14px",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const activeItemStyle: React.CSSProperties = {
  border: "1px solid rgba(192,132,252,0.28)",
  boxShadow: "0 0 0 1px rgba(192,132,252,0.12) inset",
};

const itemTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontWeight: 700,
  fontSize: "16px",
};

const itemMetaStyle: React.CSSProperties = {
  color: "#9ca3af",
  marginTop: "6px",
  fontSize: "13px",
  lineHeight: 1.6,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
  marginTop: "10px",
};

const tagStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.05)",
  color: "#d1d5db",
  fontSize: "12px",
  fontWeight: 700,
};

const previewTagsStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const previewTitleStyle: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 800,
  lineHeight: 1.3,
};

const previewMetaStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "13px",
  lineHeight: 1.7,
};

const previewContentStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
};

const paragraphStyle: React.CSSProperties = {
  margin: 0,
  color: "#e5e7eb",
  lineHeight: 1.8,
  whiteSpace: "pre-wrap",
};

const thumbnailBoxStyle: React.CSSProperties = {
  borderRadius: "18px",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
};

const thumbnailStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  objectFit: "cover",
};

const thumbnailPlaceholderStyle: React.CSSProperties = {
  padding: "28px 18px",
  borderRadius: "18px",
  border: "1px dashed rgba(255,255,255,0.12)",
  color: "#9ca3af",
  textAlign: "center",
};
