// Shared helpers for the API routes that send transactional email via Resend
// (app/api/invite, app/api/cron/weekly-report). Kept tiny and dependency-free
// since these run in Node route handlers, not the browser.

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

interface SendEmailInput {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Sends one email via the Resend API. Returns ok:false instead of throwing. */
export async function sendEmail({ apiKey, from, to, subject, html, text }: SendEmailInput) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false as const, status: res.status, detail };
    }
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, status: 0, detail: (err as Error).message };
  }
}
