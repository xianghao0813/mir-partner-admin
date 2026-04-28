import { createBrowserClient } from "@supabase/ssr";
import { ADMIN_AUTH_COOKIE_OPTIONS } from "./auth-cookie";

const memoryStorage = new Map<string, string>();

function getUserStorage() {
  if (typeof window !== "undefined") {
    return window.localStorage;
  }

  return {
    getItem(key: string) {
      return memoryStorage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      memoryStorage.set(key, value);
    },
    removeItem(key: string) {
      memoryStorage.delete(key);
    },
  };
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        userStorage: getUserStorage(),
      },
      cookieOptions: ADMIN_AUTH_COOKIE_OPTIONS,
      cookies: {
        encode: "tokens-only",
        getAll() {
          if (typeof document === "undefined") {
            return [];
          }

          return document.cookie
            .split(";")
            .map((cookie) => cookie.trim())
            .filter(Boolean)
            .map((cookie) => {
              const separatorIndex = cookie.indexOf("=");
              const name = separatorIndex >= 0 ? cookie.slice(0, separatorIndex) : cookie;
              const value = separatorIndex >= 0 ? cookie.slice(separatorIndex + 1) : "";
              return {
                name,
                value: decodeURIComponent(value),
              };
            });
        },
        setAll(cookiesToSet) {
          if (typeof document === "undefined") {
            return;
          }

          cookiesToSet.forEach(({ name, value, options }) => {
            const parts = [
              `${name}=${encodeURIComponent(value)}`,
              `Path=${options.path ?? ADMIN_AUTH_COOKIE_OPTIONS.path}`,
              `SameSite=${options.sameSite ?? ADMIN_AUTH_COOKIE_OPTIONS.sameSite}`,
            ];

            if (typeof options.maxAge === "number") {
              parts.push(`Max-Age=${options.maxAge}`);
            }
            if (options.expires) {
              parts.push(`Expires=${options.expires.toUTCString()}`);
            }
            if (options.secure) {
              parts.push("Secure");
            }

            document.cookie = parts.join("; ");
          });
        },
      },
    }
  );
}
