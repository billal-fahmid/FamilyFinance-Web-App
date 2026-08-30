'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { translate, type Locale } from '@/lib/i18n/dict';

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<LocaleCtx>({
  locale: 'en',
  setLocale: () => {},
  t: (k) => k,
});

const KEY = 'famfinance:locale';

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem(KEY)) as Locale | null;
    if (stored === 'en' || stored === 'bn') {
      setLocaleState(stored);
      document.documentElement.lang = stored;
      return;
    }
    // fall back to the saved profile preference
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('language')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          const l = (data?.language as Locale) ?? 'en';
          setLocaleState(l);
          document.documentElement.lang = l;
          try { localStorage.setItem(KEY, l); } catch {}
        });
    });
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.documentElement.lang = l;
    try { localStorage.setItem(KEY, l); } catch {}
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.from('profiles').update({ language: l }).eq('id', user.id);
    });
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
