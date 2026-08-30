'use client';

import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { useT } from '@/components/providers/locale-provider';

interface Log {
  id: string;
  action: string;
  entity_type: string | null;
  created_at: string;
  metadata: { verb?: string } | null;
}

const PAGE = 40;

const VERB_TONE = (verb?: string) => {
  if (verb === 'added' || verb === 'restored' || verb === 'marked paid') return 'border-l-income';
  if (verb === 'moved to trash' || verb === 'permanently deleted') return 'border-l-destructive';
  return 'border-l-muted-foreground/40';
};

export default function ActivityLogPage() {
  const { currentFamily } = useFamily();
  const t = useT();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(true);

  const load = useCallback(
    async (reset = false) => {
      if (!currentFamily) return;
      setLoading(true);
      const supabase = createClient();
      const from = reset ? 0 : offset;
      const { data } = await supabase
        .from('audit_logs')
        .select('id, action, entity_type, created_at, metadata')
        .eq('family_id', currentFamily.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      const rows = (data as Log[]) ?? [];
      setLogs((prev) => (reset ? rows : [...prev, ...rows]));
      setMore(rows.length === PAGE);
      setOffset(from + rows.length);
      setLoading(false);
    },
    [currentFamily, offset]
  );

  useEffect(() => {
    setOffset(0);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFamily]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('nav.activity')}</h1>
        <p className="text-sm text-muted-foreground">Every create, edit and delete across the family</p>
      </div>

      {loading && logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <ScrollText className="mx-auto mb-2 h-6 w-6" />
          No activity recorded yet.
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="divide-y p-0">
              {logs.map((l) => (
                <div key={l.id} className={`border-l-4 px-4 py-3 text-sm ${VERB_TONE(l.metadata?.verb)}`}>
                  <p>{l.action}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          {more && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => load(false)} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
