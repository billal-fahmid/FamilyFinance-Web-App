import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Sends a family-invite email.
//   Body: { email, inviteUrl, familyName, inviterName?, displayName? }
// Requires a signed-in caller. Uses Resend if RESEND_API_KEY + INVITE_FROM_EMAIL
// are set; otherwise responds { ok: false, reason: 'not_configured' } so the
// client can fall back to the copy / WhatsApp / mailto options.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email: string | undefined = body?.email?.trim();
  const inviteUrl: string | undefined = body?.inviteUrl;
  const familyName: string = body?.familyName || 'our family';
  const inviterName: string = body?.inviterName || 'A family member';
  const displayName: string = body?.displayName || 'there';

  if (!email || !inviteUrl) {
    return NextResponse.json({ ok: false, error: 'Missing email or link' }, { status: 400 });
  }

  // must be signed in
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json({ ok: false, reason: 'not_configured' });
  }

  const subject = `${inviterName} invited you to ${familyName} on Family Finance`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <h2 style="color:#006B3C;margin:0 0 8px">Family Finance</h2>
      <p>Hi ${escapeHtml(displayName)},</p>
      <p><b>${escapeHtml(inviterName)}</b> invited you to join <b>${escapeHtml(familyName)}</b> on Family Finance — a shared space to track your family's income, expenses and savings.</p>
      <p style="margin:24px 0">
        <a href="${inviteUrl}" style="background:#006B3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
          Accept invitation
        </a>
      </p>
      <p style="color:#64748b;font-size:13px">Or paste this link into your browser:<br>${inviteUrl}</p>
      <p style="color:#64748b;font-size:13px">This invitation expires in 14 days. If you weren't expecting it, you can ignore this email.</p>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email,
        subject,
        html,
        text: `${inviterName} invited you to ${familyName} on Family Finance.\n\nAccept: ${inviteUrl}\n\nThis invitation expires in 14 days.`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[invite] resend failed', res.status, detail);
      return NextResponse.json(
        { ok: false, error: 'Email service rejected the request' },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[invite] send threw', err);
    return NextResponse.json({ ok: false, error: 'Could not reach email service' }, { status: 502 });
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}
