'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/brand/logo-mark';

type State =
  | { phase: 'loading' }
  | { phase: 'preview'; familyName: string; role: string; invitedBy: string }
  | { phase: 'need-auth' }
  | { phase: 'joining' }
  | { phase: 'done'; familyId: string }
  | { phase: 'error'; message: string };

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [{ data: peek }, { data: { user } }] = await Promise.all([
        supabase.rpc('peek_family_invite', { token }),
        supabase.auth.getUser(),
      ]);

      if (!peek?.ok) {
        setState({ phase: 'error', message: 'This invite link is invalid or has expired. Ask for a new one.' });
        return;
      }
      if (!user) {
        try { sessionStorage.setItem('famfinance:pending-invite', String(token)); } catch {}
        setState({ phase: 'need-auth' });
        return;
      }
      setState({
        phase: 'preview',
        familyName: peek.family_name,
        role: peek.role,
        invitedBy: peek.invited_by,
      });
    })();
  }, [token]);

  const accept = async () => {
    setState({ phase: 'joining' });
    const supabase = createClient();
    const { data, error } = await supabase.rpc('accept_family_invite', { token });
    if (error || !data?.ok) {
      setState({
        phase: 'error',
        message:
          data?.error === 'invalid_or_expired'
            ? 'This invite link is invalid or has expired.'
            : 'Could not join this family. Please try again.',
      });
      return;
    }
    try {
      localStorage.setItem('famfinance:currentFamilyId', data.family_id);
      sessionStorage.removeItem('famfinance:pending-invite');
    } catch {}
    setState({ phase: 'done', familyId: data.family_id });
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="brand-gradient flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <LogoMark className="h-14 w-14 drop-shadow-lg" />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Family<span className="text-brand-gold">Finance</span>
          </h1>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6 text-center">
            {state.phase === 'loading' && <p className="text-sm text-muted-foreground">Checking your invite…</p>}

            {state.phase === 'need-auth' && (
              <>
                <p className="text-sm">You&apos;ve been invited to join a family on Family Finance.</p>
                <p className="text-xs text-muted-foreground">Sign in or create an account to accept.</p>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => router.push(`/login?next=/join/${token}`)}>Sign in</Button>
                  <Button variant="outline" className="flex-1" onClick={() => router.push(`/signup?next=/join/${token}`)}>
                    Sign up
                  </Button>
                </div>
              </>
            )}

            {state.phase === 'preview' && (
              <>
                <p className="text-sm">
                  <span className="font-medium">{state.invitedBy}</span> invited you to join
                </p>
                <p className="text-lg font-semibold">{state.familyName}</p>
                <p className="text-xs text-muted-foreground">You&apos;ll join as <b>{state.role}</b>.</p>
                <Button className="w-full" onClick={accept}>Join {state.familyName}</Button>
              </>
            )}

            {state.phase === 'joining' && <p className="text-sm text-muted-foreground">Joining…</p>}
            {state.phase === 'done' && <p className="text-sm text-income">Joined! Redirecting…</p>}

            {state.phase === 'error' && (
              <>
                <p className="text-sm text-destructive">{state.message}</p>
                <Button variant="outline" className="w-full" onClick={() => router.push('/dashboard')}>
                  Go to dashboard
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
