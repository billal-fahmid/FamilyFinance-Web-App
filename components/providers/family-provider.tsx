'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { setDisplayCurrency } from '@/lib/utils';
import type { Family, FamilyRole } from '@/types/database';

interface FamilyContextValue {
  families: Family[];
  currentFamily: Family | null;
  currentRole: FamilyRole | null;
  isLoading: boolean;
  setCurrentFamilyId: (id: string) => void;
  refresh: () => Promise<void>;
}

const FamilyContext = createContext<FamilyContextValue>({
  families: [],
  currentFamily: null,
  currentRole: null,
  isLoading: true,
  setCurrentFamilyId: () => {},
  refresh: async () => {},
});

const STORAGE_KEY = 'famfinance:currentFamilyId';

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [roles, setRoles] = useState<Record<string, FamilyRole>>({});
  const [currentFamilyId, setCurrentFamilyIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setFamilies([]);
      setIsLoading(false);
      return;
    }

    const { data: memberships } = await supabase
      .from('family_members')
      .select('family_id, role, families(*)')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const fams = (memberships ?? [])
      .map((m: any) => m.families as Family)
      .filter(Boolean);
    const roleMap: Record<string, FamilyRole> = {};
    (memberships ?? []).forEach((m: any) => {
      roleMap[m.family_id] = m.role;
    });

    setFamilies(fams);
    setRoles(roleMap);

    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const validStored = stored && fams.some((f) => f.id === stored) ? stored : null;
    setCurrentFamilyIdState(validStored ?? fams[0]?.id ?? null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setCurrentFamilyId = (id: string) => {
    setCurrentFamilyIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  };

  const currentFamily = families.find((f) => f.id === currentFamilyId) ?? null;
  const currentRole = currentFamilyId ? roles[currentFamilyId] ?? null : null;

  useEffect(() => {
    if (currentFamily?.currency) setDisplayCurrency(currentFamily.currency);
  }, [currentFamily?.currency]);

  return (
    <FamilyContext.Provider
      value={{ families, currentFamily, currentRole, isLoading, setCurrentFamilyId, refresh: load }}
    >
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  return useContext(FamilyContext);
}
