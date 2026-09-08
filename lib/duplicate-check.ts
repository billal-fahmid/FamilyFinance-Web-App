import { createClient } from '@/lib/supabase/client';
import { toLocalISODate } from '@/lib/utils';

// Client-side "does this look like a duplicate?" check. Runs before an insert;
// never deletes or blocks — only lets the UI warn the user.

interface Candidate {
  familyId: string;
  table: 'expenses' | 'income';
  amount: number;
  occurredOn: string; // yyyy-mm-dd
  categoryKey?: string | null;
  accountId?: string | null;
}

export interface SimilarHit {
  id: string;
  amount: number;
  occurred_on: string;
  merchant?: string | null;
  source?: string | null;
}

/** Returns matches with the same amount, same category, within ±3 days. */
export async function findSimilarTransaction(c: Candidate): Promise<SimilarHit[]> {
  try {
    const supabase = createClient();
    const d = new Date(c.occurredOn + 'T00:00:00');
    const lo = new Date(d); lo.setDate(lo.getDate() - 3);
    const hi = new Date(d); hi.setDate(hi.getDate() + 3);

    let q = supabase
      .from(c.table)
      .select('id, amount, occurred_on, merchant, source')
      .eq('family_id', c.familyId)
      .eq('amount', c.amount)
      .gte('occurred_on', toLocalISODate(lo))
      .lte('occurred_on', toLocalISODate(hi))
      .limit(3);

    if (c.categoryKey) q = q.eq('category_key', c.categoryKey);
    q = q.is('deleted_at', null);

    const { data, error } = await q;
    if (error) return [];
    return (data as SimilarHit[]) ?? [];
  } catch {
    return [];
  }
}
