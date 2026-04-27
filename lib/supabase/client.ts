import { createBrowserClient } from "@supabase/ssr";
import { ADMIN_AUTH_COOKIE_OPTIONS } from "./auth-cookie";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: ADMIN_AUTH_COOKIE_OPTIONS,
    }
  );
}
