"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  { value: "mirm", label: "暮光双龙" },
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

const MAX_ORIGINAL_THUMBNAIL_SIZE = 12 * 1024 * 1024;
const MAX_UPLOAD_THUMBNAIL_SIZE = 1536 * 1024;
const THUMBNAIL_MAX_DIMENSION = 1600;
const ALLOWED_THUMBNAIL_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
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
    setUploadingThumbnail(false);
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

  async function handleThumbnailUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setMessage("");

    if (!ALLOWED_THUMBNAIL_TYPES.has(file.type)) {
      setError("只支持 JPG、PNG、WEBP 或 GIF 图片。");
      return;
    }

    if (file.size > MAX_ORIGINAL_THUMBNAIL_SIZE) {
      setError("原始图片不能超过 12MB。");
      return;
    }

    if (file.type === "image/gif" && file.size > MAX_UPLOAD_THUMBNAIL_SIZE) {
      setError("GIF 图片不能超过 1.5MB。JPG、PNG、WEBP 会自动压缩。");
      return;
    }

    setUploadingThumbnail(true);

    try {
      const uploadFile = await prepareThumbnailFile(file);
      const formData = new FormData();
      formData.append("file", uploadFile);

      const res = await fetch(adminPath("/api/admin/uploads"), {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => null) as {
        message?: string;
        error?: string;
        url?: string;
      } | null;

      if (!res.ok) {
        const detail = [json?.message, json?.error].filter(Boolean).join(" ");
        throw new Error(detail || `Failed to upload image. HTTP ${res.status}`);
      }

      setThumbnailUrl(String(json?.url ?? ""));
      setMessage(uploadFile.size < file.size ? "缩略图已压缩并上传。" : "缩略图已上传。");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload image");
    } finally {
      setUploadingThumbnail(false);
    }
  }

  async function uploadPostImage(file: File) {
    if (!ALLOWED_THUMBNAIL_TYPES.has(file.type)) {
      throw new Error("只支持 JPG、PNG、WEBP 或 GIF 图片。");
    }

    if (file.size > MAX_ORIGINAL_THUMBNAIL_SIZE) {
      throw new Error("原始图片不能超过 12MB。");
    }

    if (file.type === "image/gif" && file.size > MAX_UPLOAD_THUMBNAIL_SIZE) {
      throw new Error("GIF 图片不能超过 1.5MB，JPG、PNG、WEBP 会自动压缩。");
    }

    const uploadFile = await prepareThumbnailFile(file);
    const formData = new FormData();
    formData.append("file", uploadFile);

    const res = await fetch(adminPath("/api/admin/uploads"), {
      method: "POST",
      body: formData,
    });
    const json = await res.json().catch(() => null) as {
      message?: string;
      error?: string;
      url?: string;
    } | null;

    if (!res.ok) {
      const detail = [json?.message, json?.error].filter(Boolean).join(" ");
      throw new Error(detail || `Failed to upload image. HTTP ${res.status}`);
    }

    return String(json?.url ?? "");
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

            <div style={uploadRowStyle}>
              <label style={uploadButtonStyle}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => void handleThumbnailUpload(event)}
                  disabled={uploadingThumbnail}
                  style={hiddenFileInputStyle}
                />
                {uploadingThumbnail ? "上传中..." : "上传缩略图"}
              </label>
              <span style={uploadHintStyle}>JPG, PNG, WEBP 自动压缩 / GIF 最大 1.5MB</span>
            </div>

            <RichTextEditor
              value={content}
              onChange={setContent}
              onImageUpload={uploadPostImage}
              onError={setError}
              onMessage={setMessage}
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

      <div
        className="rich-content"
        style={previewContentStyle}
        dangerouslySetInnerHTML={{ __html: normalizeNoticeContent(notice.content) }}
      />
    </div>
  );
}

function RichTextEditor({
  value,
  onChange,
  onImageUpload,
  onError,
  onMessage,
}: {
  value: string;
  onChange: (value: string) => void;
  onImageUpload: (file: File) => Promise<string>;
  onError: (value: string) => void;
  onMessage: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const lastHtmlRef = useRef("");
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || lastHtmlRef.current === value) {
      return;
    }

    editor.innerHTML = value;
    lastHtmlRef.current = value;
  }, [value]);

  function syncContent() {
    const nextHtml = sanitizeRichTextHtml(editorRef.current?.innerHTML ?? "");
    lastHtmlRef.current = nextHtml;
    onChange(nextHtml);
  }

  function runCommand(command: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    syncContent();
  }

  function insertHeading(tagName: "p" | "h2" | "h3" | "blockquote") {
    runCommand("formatBlock", tagName);
  }

  function insertTable() {
    editorRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      '<table><tbody><tr><th>标题</th><th>标题</th></tr><tr><td>内容</td><td>内容</td></tr></tbody></table><p><br></p>'
    );
    syncContent();
  }

  function insertLink() {
    const href = window.prompt("请输入链接 URL");
    if (!href) {
      return;
    }

    runCommand("createLink", href);
  }

  async function handleInlineImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setUploadingImage(true);
    onError("");
    onMessage("");

    try {
      const url = await onImageUpload(file);
      editorRef.current?.focus();
      document.execCommand("insertImage", false, url);
      syncContent();
      onMessage("正文图片已上传并插入。");
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <div style={richEditorShellStyle}>
      <div style={richToolbarStyle}>
        <button type="button" onClick={() => insertHeading("p")} style={toolbarButtonStyle}>正文</button>
        <button type="button" onClick={() => insertHeading("h2")} style={toolbarButtonStyle}>H2</button>
        <button type="button" onClick={() => insertHeading("h3")} style={toolbarButtonStyle}>H3</button>
        <button type="button" onClick={() => insertHeading("blockquote")} style={toolbarButtonStyle}>引用</button>
        <button type="button" onClick={() => runCommand("bold")} style={toolbarButtonStyle}>B</button>
        <button type="button" onClick={() => runCommand("italic")} style={toolbarButtonStyle}>I</button>
        <button type="button" onClick={() => runCommand("underline")} style={toolbarButtonStyle}>U</button>
        <select onChange={(event) => runCommand("fontSize", event.target.value)} defaultValue="" style={toolbarSelectStyle}>
          <option value="" disabled>字号</option>
          <option value="2">小</option>
          <option value="3">正常</option>
          <option value="5">大</option>
          <option value="7">超大</option>
        </select>
        <label style={colorControlStyle}>
          字色
          <input type="color" onChange={(event) => runCommand("foreColor", event.target.value)} style={colorInputStyle} />
        </label>
        <label style={colorControlStyle}>
          背景
          <input type="color" onChange={(event) => runCommand("hiliteColor", event.target.value)} style={colorInputStyle} />
        </label>
        <button type="button" onClick={() => runCommand("justifyLeft")} style={toolbarButtonStyle}>左</button>
        <button type="button" onClick={() => runCommand("justifyCenter")} style={toolbarButtonStyle}>中</button>
        <button type="button" onClick={() => runCommand("justifyRight")} style={toolbarButtonStyle}>右</button>
        <button type="button" onClick={() => runCommand("insertUnorderedList")} style={toolbarButtonStyle}>列表</button>
        <button type="button" onClick={() => runCommand("insertOrderedList")} style={toolbarButtonStyle}>编号</button>
        <button type="button" onClick={insertLink} style={toolbarButtonStyle}>链接</button>
        <button type="button" onClick={insertTable} style={toolbarButtonStyle}>表格</button>
        <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} style={toolbarButtonStyle}>
          {uploadingImage ? "上传中" : "图片"}
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => void handleInlineImageUpload(event)}
          style={hiddenFileInputStyle}
        />
      </div>
      <div
        ref={editorRef}
        className="rich-content rich-content-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={syncContent}
        onBlur={syncContent}
        style={richEditorStyle}
        data-placeholder="正文"
      />
    </div>
  );
}

async function prepareThumbnailFile(file: File) {
  if (file.type === "image/gif" || file.size <= MAX_UPLOAD_THUMBNAIL_SIZE) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const qualities = [0.86, 0.78, 0.68, 0.58, 0.48];
  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob.size <= MAX_UPLOAD_THUMBNAIL_SIZE || quality === qualities[qualities.length - 1]) {
      return new File([blob], replaceFileExtension(file.name, "jpg"), { type: "image/jpeg" });
    }
  }

  return file;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to compress image"));
        }
      },
      type,
      quality
    );
  });
}

function replaceFileExtension(fileName: string, extension: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName || "thumbnail"}.${extension}`;
}

function normalizeNoticeContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }

  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return sanitizeRichTextHtml(trimmed);
  }

  return trimmed
    .split("\n")
    .map((paragraph) => `<p>${escapeHtml(paragraph) || "&nbsp;"}</p>`)
    .join("");
}

function sanitizeRichTextHtml(html: string) {
  if (typeof window === "undefined") {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const allowedTags = new Set([
    "A",
    "B",
    "BLOCKQUOTE",
    "BR",
    "DIV",
    "EM",
    "FONT",
    "H2",
    "H3",
    "I",
    "IMG",
    "LI",
    "OL",
    "P",
    "SPAN",
    "STRONG",
    "TABLE",
    "TBODY",
    "TD",
    "TH",
    "THEAD",
    "TR",
    "U",
    "UL",
  ]);
  const allowedAttributes = new Set(["href", "src", "alt", "title", "style", "target", "rel", "color", "size", "face"]);
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const nodes: Element[] = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Element);
  }

  for (const node of nodes) {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      continue;
    }

    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (!allowedAttributes.has(name) || name.startsWith("on")) {
        node.removeAttribute(attribute.name);
        continue;
      }

      if ((name === "href" || name === "src") && !isSafeUrl(value)) {
        node.removeAttribute(attribute.name);
      }
    }

    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  }

  return template.innerHTML;
}

function isSafeUrl(value: string) {
  return /^(https?:|mailto:|tel:|\/)/i.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

const uploadRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const uploadButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  padding: "0 16px",
  borderRadius: "13px",
  border: "1px solid rgba(250,204,21,0.28)",
  background: "rgba(250,204,21,0.12)",
  color: "#fde68a",
  fontSize: "14px",
  fontWeight: 800,
  cursor: "pointer",
};

const hiddenFileInputStyle: React.CSSProperties = {
  display: "none",
};

const richEditorShellStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  background: "rgba(0,0,0,0.24)",
  overflow: "hidden",
};

const richToolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
  padding: "10px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
};

const toolbarButtonStyle: React.CSSProperties = {
  minHeight: "34px",
  padding: "0 10px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.06)",
  color: "#f9fafb",
  fontWeight: 800,
  cursor: "pointer",
};

const toolbarSelectStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  colorScheme: "dark",
};

const colorControlStyle: React.CSSProperties = {
  minHeight: "34px",
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  padding: "0 10px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.06)",
  color: "#f9fafb",
  fontSize: "13px",
  fontWeight: 800,
};

const colorInputStyle: React.CSSProperties = {
  width: "26px",
  height: "24px",
  border: "none",
  padding: 0,
  background: "transparent",
};

const richEditorStyle: React.CSSProperties = {
  minHeight: "260px",
  padding: "16px",
  color: "#f9fafb",
  lineHeight: 1.75,
  outline: "none",
  overflowY: "auto",
};

const uploadHintStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
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
