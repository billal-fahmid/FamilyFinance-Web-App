'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Target, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { SavingsGoalDialog } from '@/components/wealth/savings-goal-dialog';
import { ContributionDialog } from '@/components/wealth/contribution-dialog';
import { formatBDT, formatDate } from '@/lib/utils';
import { requiredMonthly, daysUntil } from '@/lib/finance';
import { SAVINGS_GOAL_TYPES } from '@/lib/validations/wealth';
import type { SavingsGoal } from '@/types/database';

const TYPE_LABEL = Object.fromEntries(SAVINGS_GOAL_TYPES.map((t) => [t.key, t.label]));

export default function SavingsPage() {
  const { currentFamily } = useFamily();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [contribOpen, setContribOpen] = useState(false);
  const [contribGoal, setContribGoal] = useState<SavingsGoal | null>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('savings_goals')
      .select('*')
      .eq('family_id', currentFamily.id)
      .order('created_at', { ascending: true });
    setGoals((data as SavingsGoal[]) ?? []);
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this goal and its contributions?')) return;
    const supabase = createClient();
    await supabase.from('savings_goals').delete().eq('id', id);
    load();
  };

  const totalTarget = goals.reduce((s, g) => s + Number(g.target_amount), 0);
  const totalSaved = goals.reduce((s, g) => s + Number(g.current_amount), 0);
  const achieved = goals.filter((g) => g.is_achieved).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Savings Goals</h1>
          <p className="text-sm text-muted-foreground">{goals.length} goal{goals.length === 1 ? '' : 's'}</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> New Goal
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : goals.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No savings goals yet. Create one — emergency fund, Hajj, a car, Eid — and track progress toward it.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Total Target" value={formatBDT(totalTarget)} />
            <StatTile label="Total Saved" value={formatBDT(totalSaved)} tone="income" />
            <StatTile label="Still Needed" value={formatBDT(Math.max(totalTarget - totalSaved, 0))} tone="expense" />
            <StatTile label="Goals Achieved" value={`${achieved} / ${goals.length}`} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {goals.map((g) => {
              const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
              const remaining = Math.max(g.target_amount - g.current_amount, 0);
              const perMonth = requiredMonthly(g.target_amount, g.current_amount, g.target_date);
              const dLeft = g.target_date ? daysUntil(g.target_date) : null;
              return (
                <Card key={g.id} className="hover:shadow-md">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                          {g.is_achieved ? <Check className="h-4 w-4" /> : <Target className="h-4 w-4" />}
                        </span>
                        <div>
                          <p className="font-medium">{g.name}</p>
                          <p className="text-xs text-muted-foreground">{TYPE_LABEL[g.goal_type] ?? g.goal_type}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(g); setFormOpen(true); }} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(g.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-end justify-between">
                      <span className="text-lg font-semibold tabular-nums">{formatBDT(g.current_amount)}</span>
                      <span className="text-sm text-muted-foreground">of {formatBDT(g.target_amount)}</span>
                    </div>
                    <Progress
                      value={pct}
                      tone={g.is_achieved ? 'ok' : 'primary'}
                      className="mt-2 h-2.5"
                    />
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>{pct.toFixed(1)}%</span>
                      <span>{formatBDT(remaining)} to go</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {g.target_date && (
                        <span>
                          Target {formatDate(g.target_date)}
                          {dLeft !== null && ` (${dLeft < 0 ? 'passed' : `${dLeft}d left`})`}
                        </span>
                      )}
                      {perMonth !== null && perMonth > 0 && (
                        <span className="font-medium text-foreground">Save {formatBDT(perMonth)}/mo</span>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={() => { setContribGoal(g); setContribOpen(true); }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add contribution
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <SavingsGoalDialog open={formOpen} onOpenChange={setFormOpen} onSaved={load} editing={editing} />
      <ContributionDialog open={contribOpen} onOpenChange={setContribOpen} onSaved={load} goal={contribGoal} />
    </div>
  );
}
