'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface Conn {
  online: boolean;
  /** true briefly after coming back online while queued writes replay */
  syncing: boolean;
}

const Ctx = createContext<Conn>({ online: true, syncing: false });

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      setSyncing(true);
      // give the service-worker background-sync queue a moment to flush
      setTimeout(() => setSyncing(false), 4000);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return <Ctx.Provider value={{ online, syncing }}>{children}</Ctx.Provider>;
}

export const useConnectivity = () => useContext(Ctx);
