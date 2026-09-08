import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CURRENCIES: Record<string, { symbol: string; locale: string }> = {
  BDT: { symbol: '৳', locale: 'en-IN' }, // en-IN gives lakh/crore grouping
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'en-IE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  INR: { symbol: '₹', locale: 'en-IN' },
  SAR: { symbol: 'SAR ', locale: 'en-US' },
  AED: { symbol: 'AED ', locale: 'en-US' },
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCIES);

/**
 * Format money for a given currency. BDT/INR use lakh/crore digit grouping
 * (last 3 digits, then groups of 2) e.g. 125000 -> "৳1,25,000".
 */
export function formatMoney(
  amount: number,
  currency = 'BDT',
  opts?: { withSymbol?: boolean; decimals?: number }
) {
  const { withSymbol = true, decimals = 0 } = opts ?? {};
  const cfg = CURRENCIES[currency] ?? CURRENCIES.BDT;
  const formatted = new Intl.NumberFormat(cfg.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(amount));
  const sign = amount < 0 ? '-' : '';
  return `${sign}${withSymbol ? cfg.symbol : ''}${formatted}`;
}

// The family's display currency. Set by FamilyProvider on the client; stays
// 'BDT' on the server so nothing leaks between requests.
let displayCurrency = 'BDT';
export function setDisplayCurrency(code: string) {
  if (typeof window !== 'undefined' && CURRENCIES[code]) displayCurrency = code;
}
export function getDisplayCurrency() {
  return typeof window !== 'undefined' ? displayCurrency : 'BDT';
}

/** Primary money formatter used across the app — follows the family currency. */
export function formatBDT(amount: number, opts?: { withSymbol?: boolean; decimals?: number }) {
  return formatMoney(amount, getDisplayCurrency(), opts);
}

export function formatDate(date: string | Date, opts?: Intl.DateTimeFormatOptions) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  }).format(d);
}

/**
 * Format a Date as YYYY-MM-DD using its local calendar fields.
 * `Date#toISOString()` converts to UTC first, which silently shifts the
 * date back a day for any timezone ahead of UTC (e.g. Asia/Dhaka, UTC+6) —
 * always for a local-midnight Date, and for `new Date()` itself whenever
 * it's before the UTC offset's hour in local time. Use this instead
 * anywhere a Date needs to become the "today" or "this day" ISO string.
 */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return toLocalISODate(new Date());
}

/** Client-generated UUID — used so offline-queued inserts replay idempotently. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
