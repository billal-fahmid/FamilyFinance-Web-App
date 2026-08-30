import { translate, type Locale } from '@/lib/i18n/dict';

// Maps raw Supabase / Postgres / network errors to friendly, safe messages.
// Never surface a raw DB error string to the user.

interface AnyError {
  message?: string;
  code?: string;
  status?: number;
  details?: string | null;
}

export function friendlyError(err: unknown, locale: Locale = 'en'): string {
  const t = (k: string) => translate(locale, k);
  if (!err) return t('error.generic');

  const e = (typeof err === 'string' ? { message: err } : err) as AnyError;
  const msg = (e.message || '').toLowerCase();
  const code = e.code || '';

  // Offline / network
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    (typeof navigator !== 'undefined' && !navigator.onLine)
  ) {
    return t('error.network');
  }

  // Postgres / PostgREST codes
  if (code === '42501' || e.status === 403 || msg.includes('row-level security') || msg.includes('permission denied')) {
    return t('error.permission');
  }
  if (code === 'PGRST116' || e.status === 404 || msg.includes('not found')) {
    return t('error.notFound');
  }
  if (code === '23505' || msg.includes('duplicate key')) {
    return t('error.duplicate');
  }
  if (code === '23503' || msg.includes('foreign key')) {
    return t('error.save');
  }
  if (code === '23514' || msg.includes('check constraint') || msg.includes('violates')) {
    return t('error.amount');
  }
  if (code === '23502' || msg.includes('null value')) {
    return t('error.required');
  }

  // Auth
  if (msg.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (msg.includes('email rate limit')) return 'Too many attempts — please wait a few minutes.';
  if (msg.includes('jwt') || msg.includes('token') || e.status === 401) {
    return 'Your session expired. Please sign in again.';
  }

  return t('error.generic');
}
