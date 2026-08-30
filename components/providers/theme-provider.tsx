'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ThemePref = 'light' | 'dark' | 'system';

interface ThemeCtx {
  theme: ThemePref;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'system', resolved: 'light', setTheme: () => {} });
const KEY = 'famfinance:theme';

function apply(pref: ThemePref): 'light' | 'dark' {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const dark = pref === 'dark' || (pref === 'system' && mql.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  return dark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem(KEY)) as ThemePref | null;
    const initial: ThemePref = stored ?? 'system';
    setThemeState(initial);
    setResolved(apply(initial));

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const cur = (localStorage.getItem(KEY) as ThemePref | null) ?? 'system';
      if (cur === 'system') setResolved(apply('system'));
    };
    mql.addEventListener('change', onChange);

    // pull profile preference if nothing stored locally
    if (!stored) {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase.from('profiles').select('theme').eq('id', user.id).maybeSingle().then(({ data }) => {
          const p = (data?.theme as ThemePref) ?? 'system';
          setThemeState(p);
          setResolved(apply(p));
        });
      });
    }
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    setResolved(apply(t));
    try { localStorage.setItem(KEY, t); } catch {}
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.from('profiles').update({ theme: t }).eq('id', user.id);
    });
  }, []);

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
