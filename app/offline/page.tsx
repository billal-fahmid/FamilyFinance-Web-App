import { LogoMark } from '@/components/brand/logo-mark';

export const metadata = { title: 'Offline — Family Finance' };

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <LogoMark className="h-14 w-14" />
      <h1 className="text-lg font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Family Finance can&apos;t reach the server right now. Pages you&apos;ve already opened still work,
        and anything you add will sync automatically once you&apos;re back online.
      </p>
      <a
        href="/dashboard"
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Try again
      </a>
    </div>
  );
}
