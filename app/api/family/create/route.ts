import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

const schema = z.object({
  name: z.string().trim().min(1, 'Family name is required'),
  currency: z.string().default('BDT'),
});

// Creating the first family is a bootstrap step: the user has no family
// membership yet, and a flaky client-side session can make the browser's
// insert arrive unauthenticated (RLS then rejects it). So do it here — read
// the session from the cookie (same as middleware), then write with the
// admin client.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Your session expired. Sign out and log in again.' }, { status: 401 });
  }

  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY === 'YOUR-SERVICE-ROLE-KEY'
  ) {
    return NextResponse.json(
      { error: 'Server auth is not configured. Restart the dev server after editing .env.' },
      { status: 500 }
    );
  }

  const admin = createAdminClient();

  const { data: family, error } = await admin
    .from('families')
    .insert({ name: parsed.data.name, currency: parsed.data.currency, created_by: user.id })
    .select()
    .single();

  if (error || !family) {
    return NextResponse.json({ error: error?.message ?? 'Could not create family' }, { status: 500 });
  }

  const { error: memberError } = await admin.from('family_members').insert({
    family_id: family.id,
    user_id: user.id,
    display_name: (user.user_metadata?.full_name as string) || user.email || 'Owner',
    role: 'owner',
    status: 'active',
  });

  if (memberError) {
    // roll back the orphan family
    await admin.from('families').delete().eq('id', family.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, familyId: family.id });
}
