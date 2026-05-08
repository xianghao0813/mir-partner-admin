import crypto from "node:crypto";

type QuickSdkConfig = {
  baseUrl: string;
  openId: string;
  openKey: string;
  productCode: string;
  channelCode: string;
};

type QuickSdkApiResponse = {
  status?: boolean;
  data?: unknown;
  message?: string;
};

const QUICKSDK_DEFAULT_BASE_URL = "https://sdkapi.gamewemade.com";
const QUICKSDK_DEFAULT_CHANNEL_CODE = "website";

export async function changeQuickSdkPlatformCoins({
  userId,
  amount,
  remark,
}: {
  userId: string;
  amount: string;
  remark?: string;
}) {
  const config = getQuickSdkConfig();
  const payload = buildSignedParams({
    openId: config.openId,
    productCode: config.productCode,
    channelCode: config.channelCode,
    userId,
    amount,
    remark,
  });

  const result = await postQuickSdkForm("/webOpen/payToUser", payload);
  return normalizeQuickSdkWalletAmount(result.data);
}

function getQuickSdkConfig(): QuickSdkConfig {
  const baseUrl =
    process.env.QUICKSDK_BASE_URL?.trim().replace(/\/+$/, "") ?? QUICKSDK_DEFAULT_BASE_URL;
  const openId = process.env.QUICKSDK_OPEN_ID?.trim() ?? "";
  const openKey = process.env.QUICKSDK_OPEN_KEY?.trim() ?? "";
  const productCode = process.env.QUICKSDK_PRODUCT_CODE?.trim() ?? "";
  const channelCode =
    process.env.QUICKSDK_CHANNEL_CODE?.trim() ?? QUICKSDK_DEFAULT_CHANNEL_CODE;

  if (!openId || !openKey || !productCode) {
    throw new Error(
      "QuickSDK environment variables are missing. Required: QUICKSDK_OPEN_ID, QUICKSDK_OPEN_KEY, QUICKSDK_PRODUCT_CODE."
    );
  }

  return { baseUrl, openId, openKey, productCode, channelCode };
}

async function postQuickSdkForm(path: string, payload: Record<string, string>) {
  const config = getQuickSdkConfig();
  const response = await postForm(`${config.baseUrl}${path}`, payload);
  const text = await response.text();
  const json = parseJson<QuickSdkApiResponse>(text);

  if (!response.ok) {
    throw new Error(json?.message || `QuickSDK request failed with status ${response.status}`);
  }

  if (!json) {
    throw new Error("QuickSDK returned an invalid response.");
  }

  if (!json.status) {
    throw new Error(json.message || "QuickSDK request failed.");
  }

  return json;
}

function buildSignedParams(input: Record<string, string | undefined>) {
  const { openKey } = getQuickSdkConfig();
  const normalized = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== "")
  ) as Record<string, string>;

  const sorted = Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b));
  const signBase = `${sorted.map(([key, value]) => `${key}=${value}&`).join("")}${openKey}`;
  const sign = crypto.createHash("md5").update(signBase, "utf8").digest("hex");

  return { ...normalized, sign };
}

async function postForm(url: string, payload: Record<string, string>) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    formData.append(key, value);
  });

  return fetch(url, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
}

function normalizeQuickSdkWalletAmount(data: unknown) {
  const candidate =
    Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | undefined);

  if (typeof data === "number" && Number.isFinite(data)) {
    return data;
  }

  if (typeof data === "string") {
    const parsed = Number(data);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (!candidate || typeof candidate !== "object") {
    return 0;
  }

  return readNumber(candidate.amount) || readNumber(candidate.balance) || readNumber(candidate.money);
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
