import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client — used in Client Components (forms, buttons).
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
