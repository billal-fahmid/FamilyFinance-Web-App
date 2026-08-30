import { createBrowserClient } from '@supabase/ssr';

// NOTE: not using the strict Database generic here — our hand-written
// types/database.ts doesn't match supabase-js's full generic shape
// (Tables/Views/Functions/Relationships). Swap in real generated types
// via `npx supabase gen types typescript --linked` once the project is
// linked to a live Supabase instance, then re-add `<Database>` here.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
