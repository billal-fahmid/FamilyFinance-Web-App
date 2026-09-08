'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { creditCardEmiSchema, type CreditCardEmiInput } from '@/lib/validations/credit';
import { todayISO, formatBDT, toLocalISODate } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  cardId: string;
}

export function CcEmiDialog({ open, onOpenChange, onSaved, cardId }: Props) {
  const { currentFamily } = useFamily();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreditCardEmiInput>({
    resolver: zodResolver(creditCardEmiSchema),
    defaultValues: { startDate: todayISO(), downPayment: 0, interestRate: 0, cardId },
  });

  useEffect(() => {
    if (open) reset({ startDate: todayISO(), downPayment: 0, interestRate: 0, cardId });
  }, [open, cardId, reset]);

  const original = Number(watch('originalAmount')) || 0;
  const down = Number(watch('downPayment')) || 0;
  const tenure = Number(watch('tenureMonths')) || 0;
  const rate = Number(watch('interestRate')) || 0;
  const financed = Math.max(original - down, 0);
  const suggestedMonthly = tenure > 0 ? Math.round((financed * (1 + (rate / 100) * (tenure / 12))) / tenure) : 0;

  const onSubmit = async (data: CreditCardEmiInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const endDate = new Date(data.startDate + 'T00:00:00');
    endDate.setMonth(endDate.getMonth() + data.tenureMonths);

    const { data: emi, error } = await supabase
      .from('credit_card_emi')
      .insert({
        family_id: currentFamily.id,
        card_id: cardId,
        product: data.product,
        original_amount: data.originalAmount,
        down_payment: data.downPayment,
        tenure_months: data.tenureMonths,
        monthly_installment: data.monthlyInstallment || suggestedMonthly,
        interest_rate: data.interestRate,
        start_date: data.startDate,
        end_date: toLocalISODate(endDate),
        notes: data.notes || null,
      })
      .select()
      .single();

    if (error) {
      setIsSubmitting(false);
      return setServerError(error.message);
    }

    // Post the financed amount to the card as an EMI purchase so outstanding reflects it.
    const financedAmount = Math.max(data.originalAmount - data.downPayment, 0);
    if (financedAmount > 0) {
      await supabase.from('credit_card_transactions').insert({
        family_id: currentFamily.id,
        card_id: cardId,
        emi_id: emi.id,
        type: 'emi_purchase',
        amount: financedAmount,
        occurred_on: data.startDate,
        merchant: data.product,
        notes: `EMI · ${data.tenureMonths} months`,
        created_by: user!.id,
      });
    }

    setIsSubmitting(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New EMI Purchase</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product">Product</Label>
            <Input id="product" placeholder="Samsung refrigerator" {...register('product')} />
            {errors.product && <p className="text-sm text-destructive">{errors.product.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="originalAmount">Original amount (৳)</Label>
              <Input id="originalAmount" type="number" step="0.01" {...register('originalAmount')} />
              {errors.originalAmount && <p className="text-sm text-destructive">{errors.originalAmount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="downPayment">Down payment (৳)</Label>
              <Input id="downPayment" type="number" step="0.01" {...register('downPayment')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tenureMonths">Installments (months)</Label>
              <Input id="tenureMonths" type="number" min={1} {...register('tenureMonths')} />
              {errors.tenureMonths && <p className="text-sm text-destructive">{errors.tenureMonths.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="interestRate">Interest rate (%)</Label>
              <Input id="interestRate" type="number" step="0.01" {...register('interestRate')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="monthlyInstallment">Monthly installment (৳)</Label>
            <div className="flex gap-2">
              <Input id="monthlyInstallment" type="number" step="0.01" {...register('monthlyInstallment')} />
              {suggestedMonthly > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setValue('monthlyInstallment', suggestedMonthly)}
                >
                  Use {formatBDT(suggestedMonthly)}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register('startDate')} />
          </div>

          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Financed amount <b>{formatBDT(financed)}</b> is posted to the card now as an EMI purchase.
            Record each monthly installment as it is paid from the card&apos;s EMI tab.
          </p>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Create EMI'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
