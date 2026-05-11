import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ADMIN_AUTH_COOKIE_OPTIONS } from "./auth-cookie";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: ADMIN_AUTH_COOKIE_OPTIONS,
      cookies: {
        encode: "tokens-only",
        getAll() {
          return cookieStore
            .getAll()
            .filter(({ name }) => isAdminAuthCookieName(name));
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                maxAge:
                  typeof options.maxAge === "number" && options.maxAge <= 0
                    ? options.maxAge
                    : undefined,
                expires: value === "" ? options.expires : undefined,
              })
            );
          } catch {}
        },
      },
    }
  );
}

function isAdminAuthCookieName(name: string) {
  return (
    name === ADMIN_AUTH_COOKIE_OPTIONS.name ||
    name.startsWith(`${ADMIN_AUTH_COOKIE_OPTIONS.name}.`)
  );
}
