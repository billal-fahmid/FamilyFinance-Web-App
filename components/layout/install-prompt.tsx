'use client';

import { useEffect, useState } from 'react';
import { Download, X, WifiOff, RefreshCw } from 'lucide-react';
import { useConnectivity } from '@/components/providers/connectivity';
import { useT } from '@/components/providers/locale-provider';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallAndOfflineBar() {
  const t = useT();
  const { online, syncing } = useConnectivity();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => setDeferred(null));
    try {
      if (localStorage.getItem('famfinance:install-dismissed')) setDismissed(true);
    } catch {}
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!online) {
    return (
      <div className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-medium text-white">
        <WifiOff className="h-3.5 w-3.5" />
        {t('offline.badge')} — {t('error.network')}
      </div>
    );
  }

  if (syncing) {
    return (
      <div className="flex items-center justify-center gap-2 bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        {t('offline.synced')}
      </div>
    );
  }

  if (!deferred || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-2 bg-secondary px-3 py-1.5 text-xs text-secondary-foreground">
      <span>{t('pwa.install')} — Family Finance</span>
      <div className="flex items-center gap-1">
        <button
          className="rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          }}
        >
          <Download className="mr-1 inline h-3 w-3" />
          {t('pwa.install')}
        </button>
        <button
          aria-label={t('action.close')}
          onClick={() => {
            setDismissed(true);
            try { localStorage.setItem('famfinance:install-dismissed', '1'); } catch {}
          }}
          className="rounded p-0.5 hover:bg-black/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
