import type { NextResponse } from "next/server";
import { ADMIN_AUTH_COOKIE_OPTIONS } from "./auth-cookie";

const COOKIE_PATHS = ["/admin", "/"] as const;
const COMMON_AUTH_COOKIE_BASES = [
  ADMIN_AUTH_COOKIE_OPTIONS.name,
  "sb-auth-token",
];

export function clearAuthCookies(response: NextResponse) {
  const cookieBases = new Set(COMMON_AUTH_COOKIE_BASES);
  const projectRef = getSupabaseProjectRef();
  if (projectRef) {
    cookieBases.add(`sb-${projectRef}-auth-token`);
  }

  for (const baseName of cookieBases) {
    for (const name of getCookieChunkNames(baseName)) {
      for (const path of COOKIE_PATHS) {
        response.cookies.set(name, "", {
          path,
          sameSite: "lax",
          maxAge: 0,
          expires: new Date(0),
        });
      }
    }
  }
}

function getCookieChunkNames(baseName: string) {
  const names = [baseName];
  for (let index = 0; index <= 25; index += 1) {
    names.push(`${baseName}.${index}`);
  }
  return names;
}

function getSupabaseProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}
