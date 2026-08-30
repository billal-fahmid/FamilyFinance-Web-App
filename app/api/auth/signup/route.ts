import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { signUpSchema } from '@/lib/validations/auth';

// Full server-side sign-up:
//   1. create the user via the admin API, already email-confirmed
//      (no confirmation email -> never hits the mailer rate limit)
//   2. sign them in and write the auth cookies
// The browser just calls this once and then navigates.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signUpSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey || serviceKey === 'YOUR-SERVICE-ROLE-KEY') {
    console.error('[signup] missing env', {
      url: !!url,
      anonKey: !!anonKey,
      serviceKey: serviceKey ? `${serviceKey.slice(0, 10)}…` : 'MISSING',
    });
    return NextResponse.json(
      { error: 'Server auth is not configured. Restart the dev server after editing .env.' },
      { status: 500 }
    );
  }

  const { fullName, email, password } = parsed.data;

  // 1. create user
  const admin = createSupabaseJsClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    console.error('[signup] createUser failed', createError.status, createError.message);
    const exists =
      createError.status === 422 ||
      createError.message.toLowerCase().includes('already') ||
      createError.message.toLowerCase().includes('registered');
    return NextResponse.json(
      {
        error: exists
          ? 'An account with this email already exists. Try signing in instead.'
          : createError.message,
      },
      { status: exists ? 409 : 500 }
    );
  }

  console.error('[signup] created user', created.user?.id, created.user?.email);

  // 2. sign in + set cookies
  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get: (name: string) => cookieStore.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) =>
        cookieStore.set({ name, value, ...options }),
      remove: (name: string, options: CookieOptions) =>
        cookieStore.set({ name, value: '', ...options }),
    },
  });

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    console.error('[signup] post-create signIn failed', signInError.status, signInError.message);
    return NextResponse.json(
      { error: `Account created but sign-in failed: ${signInError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
