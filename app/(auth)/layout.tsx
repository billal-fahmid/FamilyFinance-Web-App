import { LogoMark } from '@/components/brand/logo-mark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="brand-gradient flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <LogoMark className="h-14 w-14 drop-shadow-lg" />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Family<span className="text-brand-gold">Finance</span>
          </h1>
          <p className="text-sm text-white/80">Smarter finances, happier families</p>
        </div>
        {children}
      </div>
    </div>
  );
}
