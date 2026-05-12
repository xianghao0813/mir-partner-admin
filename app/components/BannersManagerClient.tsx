"use client";

import { useEffect, useState } from "react";
import { adminPath } from "@/lib/paths";

type Banner = {
  id: number;
  title: string | null;
  image_url: string;
  link_url: string | null;
  game_slug: string | null;
  sort_order: number;
  is_active: boolean;
};

const gameOptions = [
  { value: "", label: "General" },
  { value: "mir4", label: "MIR4" },
  { value: "mirm", label: "暮光双龙" },
  { value: "night-crows", label: "Night Crows" },
  { value: "legend-of-ymir", label: "Legend of YMIR" },
];

const gameLabelMap = Object.fromEntries(gameOptions.map((option) => [option.value, option.label]));
const MAX_ORIGINAL_BANNER_SIZE = 12 * 1024 * 1024;
const MAX_UPLOAD_BANNER_SIZE = 1536 * 1024;
const BANNER_MAX_DIMENSION = 2200;
const ALLOWED_BANNER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export default function BannersManagerClient() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [gameSlug, setGameSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    void loadBanners();
  }, []);

  async function loadBanners() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(adminPath("/api/admin/banners"), { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to fetch banners");
      }

      setBanners(json?.banners ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to fetch banners");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setImageUrl("");
    setLinkUrl("");
    setGameSlug("");
    setSortOrder(0);
    setIsActive(true);
    setUploadingImage(false);
    setError("");
    setMessage("");
  }

  function startEdit(banner: Banner) {
    setEditingId(banner.id);
    setTitle(banner.title ?? "");
    setImageUrl(banner.image_url);
    setLinkUrl(banner.link_url ?? "");
    setGameSlug(banner.game_slug ?? "");
    setSortOrder(banner.sort_order);
    setIsActive(Boolean(banner.is_active));
    setError("");
    setMessage(`Editing banner ID: ${banner.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!imageUrl.trim()) {
      setError("Image URL is required.");
      return;
    }

    setSubmitting(true);

    try {
      const isEditing = editingId !== null;
      const res = await fetch(
        isEditing ? adminPath(`/api/admin/banners/${editingId}`) : adminPath("/api/admin/banners"),
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            imageUrl,
            linkUrl,
            gameSlug,
            sortOrder,
            isActive,
          }),
        }
      );
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to save banner");
      }

      await loadBanners();
      setMessage(isEditing ? "Banner updated." : `Banner created. ID: ${json?.id ?? "-"}`);

      if (!isEditing) {
        resetForm();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save banner");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBannerUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setMessage("");

    if (!ALLOWED_BANNER_TYPES.has(file.type)) {
      setError("只支持 JPG、PNG、WEBP 或 GIF 图片。");
      return;
    }

    if (file.size > MAX_ORIGINAL_BANNER_SIZE) {
      setError("原始图片不能超过 12MB。");
      return;
    }

    if (file.type === "image/gif" && file.size > MAX_UPLOAD_BANNER_SIZE) {
      setError("GIF 图片不能超过 1.5MB。JPG、PNG、WEBP 会自动压缩。");
      return;
    }

    setUploadingImage(true);

    try {
      const uploadFile = await prepareBannerFile(file);
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

      setImageUrl(String(json?.url ?? ""));
      setMessage(uploadFile.size < file.size ? "Banner image compressed and uploaded." : "Banner image uploaded.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this banner?")) return;

    try {
      const res = await fetch(adminPath(`/api/admin/banners/${id}`), { method: "DELETE" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.message ?? "Failed to delete banner");
      }

      if (editingId === id) {
        resetForm();
      }

      await loadBanners();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete banner");
    }
  }

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section style={panelStyle}>
        <div style={headerRowStyle}>
          <div style={panelTitleStyle}>{editingId ? "Edit Banner" : "Create Banner"}</div>
          {editingId ? (
            <button type="button" onClick={resetForm} style={ghostButtonStyle}>
              Cancel Edit
            </button>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Banner title" style={inputStyle} />
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL" style={inputStyle} />
          <div style={uploadRowStyle}>
            <label style={uploadButtonStyle}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => void handleBannerUpload(event)}
                disabled={uploadingImage}
                style={hiddenFileInputStyle}
              />
              {uploadingImage ? "Uploading..." : "Upload Banner Image"}
            </label>
            <span style={uploadHintStyle}>JPG, PNG, WEBP auto-compress / GIF max 1.5MB</span>
          </div>
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Link URL" style={inputStyle} />

          <div style={threeColStyle}>
            <select value={gameSlug} onChange={(e) => setGameSlug(e.target.value)} style={inputStyle}>
              {gameOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              placeholder="Sort order"
              style={inputStyle}
            />
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span>Active</span>
            </label>
          </div>

          {error ? <div style={errorStyle}>{error}</div> : null}
          {message ? <div style={messageStyle}>{message}</div> : null}

          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Saving..." : editingId ? "Save Changes" : "Create Banner"}
          </button>
        </form>
      </section>

      <section style={panelStyle}>
        <div style={headerRowStyle}>
          <div style={panelTitleStyle}>Banner List</div>
          <button type="button" onClick={() => void loadBanners()} style={ghostButtonStyle}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={stateStyle}>Loading banners...</div>
        ) : banners.length === 0 ? (
          <div style={stateStyle}>No banners found.</div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {banners.map((banner) => (
              <article key={banner.id} style={itemStyle}>
                <div style={itemHeaderStyle}>
                  <div>
                    <div style={itemTitleStyle}>{banner.title || `Banner #${banner.id}`}</div>
                    <div style={itemMetaStyle}>
                      Sort {banner.sort_order} | {banner.is_active ? "Active" : "Inactive"} | {gameLabelMap[banner.game_slug ?? ""] ?? banner.game_slug ?? "General"}
                    </div>
                  </div>
                  <div style={actionsStyle}>
                    <button type="button" onClick={() => startEdit(banner)} style={ghostButtonStyle}>
                      Edit
                    </button>
                    <button type="button" onClick={() => void handleDelete(banner.id)} style={dangerButtonStyle}>
                      Delete
                    </button>
                  </div>
                </div>

                <div style={itemMetaStyle}>Image: {banner.image_url}</div>
                <div style={itemMetaStyle}>Link: {banner.link_url || "-"}</div>

                <div style={previewBoxStyle}>
                  <img src={banner.image_url} alt={banner.title || `Banner ${banner.id}`} style={previewImageStyle} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function prepareBannerFile(file: File) {
  if (file.type === "image/gif" || file.size <= MAX_UPLOAD_BANNER_SIZE) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, BANNER_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
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
    if (blob.size <= MAX_UPLOAD_BANNER_SIZE || quality === qualities[qualities.length - 1]) {
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
  return `${baseName || "banner"}.${extension}`;
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

const uploadHintStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
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

const itemStyle: React.CSSProperties = {
  padding: "14px",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const itemHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: "8px",
};

const itemTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontWeight: 700,
  fontSize: "16px",
};

const itemMetaStyle: React.CSSProperties = {
  color: "#9ca3af",
  marginTop: "4px",
  fontSize: "13px",
  lineHeight: 1.6,
  overflowWrap: "anywhere",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const previewBoxStyle: React.CSSProperties = {
  marginTop: "12px",
  borderRadius: "18px",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
};

const previewImageStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxHeight: "280px",
  objectFit: "cover",
};
