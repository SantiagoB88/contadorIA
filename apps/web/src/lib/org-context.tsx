'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Membership } from '@dashgobo/contracts';
import { useAuth } from './auth-context';

const STORAGE_KEY = 'dashgobo:currentOrganizationId';

interface OrgContextValue {
  organizationId: string | null;
  membership: Membership | null;
  memberships: Membership[];
  setOrganizationId: (id: string) => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { memberships } = useAuth();
  const [organizationId, setOrganizationIdState] = useState<string | null>(null);

  useEffect(() => {
    if (memberships.length === 0) {
      setOrganizationIdState(null);
      return;
    }
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing / storage disabled — fall back to the first membership.
    }
    const isValid = stored && memberships.some((m) => m.organizationId === stored);
    setOrganizationIdState(isValid ? stored : (memberships[0]?.organizationId ?? null));
  }, [memberships]);

  const setOrganizationId = (id: string) => {
    setOrganizationIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Ignore — the selection still works for this tab via state.
    }
  };

  const membership = useMemo(
    () => memberships.find((m) => m.organizationId === organizationId) ?? null,
    [memberships, organizationId],
  );

  return (
    <OrgContext.Provider value={{ organizationId, membership, memberships, setOrganizationId }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within <OrgProvider>');
  return ctx;
}
