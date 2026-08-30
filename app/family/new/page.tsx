'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createFamilySchema, type CreateFamilyInput } from '@/lib/validations/family';
import { LogoMark } from '@/components/brand/logo-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NewFamilyPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateFamilyInput>({
    resolver: zodResolver(createFamilySchema),
    defaultValues: { currency: 'BDT' },
  });

  const onSubmit = async (data: CreateFamilyInput) => {
    setServerError(null);
    setIsSubmitting(true);

    const res = await fetch('/api/family/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name, currency: data.currency }),
    });
    const payload = await res.json().catch(() => ({}));
    setIsSubmitting(false);

    if (!res.ok) {
      setServerError(payload.error ?? `Could not create family (${res.status})`);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="brand-gradient flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <LogoMark className="h-12 w-12 drop-shadow-lg" />
          <h1 className="text-xl font-bold tracking-tight text-white">
            Family<span className="text-brand-gold">Finance</span>
          </h1>
        </div>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base text-foreground">Create your family</CardTitle>
          <p className="text-sm text-muted-foreground">
            This is the space where your family&apos;s income, expenses, and accounts live.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Family name</Label>
              <Input id="name" placeholder="Hossen Family" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            {serverError && <p className="text-sm text-destructive">{serverError}</p>}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create family'}
            </Button>
          </form>

          <button
            type="button"
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              router.push('/login');
              router.refresh();
            }}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
