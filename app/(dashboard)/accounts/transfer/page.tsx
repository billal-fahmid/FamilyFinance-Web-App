'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { transferSchema, type TransferInput } from '@/lib/validations/finance';
import { todayISO, formatBDT } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Account, Transfer } from '@/types/database';

export default function TransferPage() {
  const router = useRouter();
  const { currentFamily } = useFamily();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recent, setRecent] = useState<(Transfer & { from_name?: string; to_name?: string })[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<TransferInput>({ resolver: zodResolver(transferSchema), defaultValues: { occurredOn: todayISO() } });

  const fromId = watch('fromAccountId');

  const load = async () => {
    if (!currentFamily) return;
    const supabase = createClient();
    const [{ data: accs }, { data: transfers }] = await Promise.all([
      supabase.from('accounts').select('*').eq('family_id', currentFamily.id).eq('is_archived', false),
      supabase
        .from('transfers')
        .select('*')
        .eq('family_id', currentFamily.id)
        .order('occurred_on', { ascending: false })
        .limit(10),
    ]);
    setAccounts((accs as Account[]) ?? []);
    const accMap = new Map((accs ?? []).map((a: any) => [a.id, a.name]));
    setRecent(
      ((transfers as Transfer[]) ?? []).map((t) => ({
        ...t,
        from_name: accMap.get(t.from_account_id),
        to_name: accMap.get(t.to_account_id),
      }))
    );
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFamily]);

  const onSubmit = async (data: TransferInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('transfers').insert({
      family_id: currentFamily.id,
      from_account_id: data.fromAccountId,
      to_account_id: data.toAccountId,
      amount: data.amount,
      occurred_on: data.occurredOn,
      notes: data.notes || null,
      created_by: user!.id,
    });

    setIsSubmitting(false);
    if (error) {
      setServerError(error.message);
      return;
    }

    reset({ occurredOn: todayISO() } as any);
    load();
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Transfer Between Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Transfers move money between your accounts and are never counted as income or expense.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>From account</Label>
              <Controller
                control={control}
                name="fromAccountId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Source account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({formatBDT(a.current_balance)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.fromAccountId && <p className="text-sm text-destructive">{errors.fromAccountId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>To account</Label>
              <Controller
                control={control}
                name="toAccountId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Destination account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter((a) => a.id !== fromId).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.toAccountId && <p className="text-sm text-destructive">{errors.toAccountId.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (৳)</Label>
                <Input id="amount" type="number" step="0.01" placeholder="5000" {...register('amount')} />
                {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="occurredOn">Date</Label>
                <Input id="occurredOn" type="date" {...register('occurredOn')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" {...register('notes')} />
            </div>

            {serverError && <p className="text-sm text-destructive">{serverError}</p>}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Transferring…' : 'Transfer'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-foreground">Recent Transfers</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 && <p className="text-sm text-muted-foreground">No transfers yet</p>}
          {recent.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm">
              <span>{t.from_name} → {t.to_name}</span>
              <span className="font-medium tabular-nums">{formatBDT(t.amount)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
