type ThinkingDataQueryOptions = {
  sql: string;
  format?: "json" | "json_object" | "csv" | "csv_header" | "tsv" | "tsv_header";
  timeoutSeconds?: number;
};

type ThinkingDataQueryResult = {
  headers: string[];
  rows: unknown[];
  raw: string;
};

const DEFAULT_TIMEOUT_SECONDS = 10;

export function getThinkingDataConfig() {
  const host = process.env.THINKINGDATA_API_HOST?.trim();
  const token = process.env.THINKINGDATA_API_TOKEN?.trim();
  const projectId = Number(process.env.THINKINGDATA_PROJECT_ID);
  const appId = process.env.THINKINGDATA_APP_ID?.trim() ?? "";

  if (!host || !token || !Number.isFinite(projectId) || projectId <= 0) {
    throw new Error("ThinkingData is not configured.");
  }

  return {
    baseUrl: normalizeThinkingDataBaseUrl(host),
    token,
    projectId: Math.floor(projectId),
    appId,
  };
}

export async function queryThinkingDataSql({
  sql,
  format = "json_object",
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
}: ThinkingDataQueryOptions): Promise<ThinkingDataQueryResult> {
  const config = getThinkingDataConfig();
  const url = new URL("/querySql", config.baseUrl);
  url.searchParams.set("token", config.token);
  url.searchParams.set("format", format);
  url.searchParams.set("timeoutSeconds", String(timeoutSeconds));

  const body = new URLSearchParams();
  body.set("sql", sql);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`ThinkingData query failed with HTTP ${response.status}.`);
  }

  return parseThinkingDataResponse(raw, format);
}

export function buildUserEventSql({
  projectId,
  uid,
  month,
  limit,
  eventKeyword,
}: {
  projectId: number;
  uid: string;
  month: string;
  limit: number;
  eventKeyword?: string;
}) {
  const tableName = `v_event_${projectId}`;
  const safeUid = escapeSqlValue(uid);
  const { startDate, endDate } = getMonthRange(month);
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));

  const conditions = [
    `"$part_date" >= '${startDate}'`,
    `"$part_date" <= '${endDate}'`,
    `("#account_id" = '${safeUid}' or "#distinct_id" = '${safeUid}')`,
  ];
  const safeEventKeyword = eventKeyword?.trim() ? escapeSqlLikeValue(eventKeyword.trim()) : "";

  if (safeEventKeyword) {
    conditions.push(`lower(toString("#event_name")) like lower('%${safeEventKeyword}%')`);
  }

  return [
    `select *`,
    `from ${tableName}`,
    `where ${conditions.join(" and ")}`,
    `limit ${safeLimit}`,
  ].join(" ");
}

function normalizeThinkingDataBaseUrl(host: string) {
  try {
    const url = new URL(host);
    return `${url.protocol}//${url.host}`;
  } catch {
    throw new Error("Invalid ThinkingData API host.");
  }
}

function parseThinkingDataResponse(
  raw: string,
  format: ThinkingDataQueryOptions["format"]
): ThinkingDataQueryResult {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (format === "json_object") {
    const rows = lines.map((line) => parseJsonLine(line));
    return {
      headers: collectHeaders(rows),
      rows,
      raw,
    };
  }

  if (format === "json") {
    const first = lines[0] ? parseJsonLine(lines[0]) : null;
    const headers =
      first && typeof first === "object" && !Array.isArray(first)
        ? (((first as Record<string, unknown>).data as Record<string, unknown> | undefined)
            ?.headers as string[] | undefined) ?? []
        : [];

    return {
      headers,
      rows: lines.slice(1).map((line) => parseJsonLine(line)),
      raw,
    };
  }

  return {
    headers: [],
    rows: lines,
    raw,
  };
}

function parseJsonLine(line: string) {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return line;
  }
}

function collectHeaders(rows: unknown[]) {
  const headers = new Set<string>();

  rows.forEach((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return;
    }

    Object.keys(row).forEach((key) => headers.add(key));
  });

  return Array.from(headers);
}

function getMonthRange(month: string) {
  const normalized = /^\d{4}-\d{2}$/.test(month) ? month : getCurrentMonth();
  const [year, monthNumber] = normalized.split("-").map(Number);
  const startDate = `${normalized}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);

  return {
    startDate,
    endDate,
  };
}

function getCurrentMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function escapeSqlValue(value: string) {
  return value.replace(/'/g, "''");
}

function escapeSqlLikeValue(value: string) {
  return escapeSqlValue(value).replace(/[%_]/g, (match) => `\\${match}`);
}
