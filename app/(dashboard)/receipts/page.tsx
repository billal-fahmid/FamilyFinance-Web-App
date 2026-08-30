'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Trash2, ExternalLink, Upload, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { Receipt } from '@/types/database';

const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';

export default function ReceiptsPage() {
  const { currentFamily } = useFamily();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('receipts')
      .select('*')
      .eq('family_id', currentFamily.id)
      .order('created_at', { ascending: false });
    setReceipts((data as Receipt[]) ?? []);
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFiles = async (files: FileList) => {
    if (!currentFamily) return;
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`${file.name} is over 10 MB — skipped.`);
        continue;
      }
      const path = `${currentFamily.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type });
      if (upErr) {
        setError(upErr.message);
        continue;
      }
      await supabase.from('receipts').insert({
        family_id: currentFamily.id,
        uploaded_by: user!.id,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        entity_type: 'general',
      });
    }
    setBusy(false);
    load();
  };

  const view = async (r: Receipt) => {
    const supabase = createClient();
    const { data } = await supabase.storage.from('receipts').createSignedUrl(r.storage_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const remove = async (r: Receipt) => {
    if (!confirm('Delete this receipt?')) return;
    const supabase = createClient();
    await supabase.storage.from('receipts').remove([r.storage_path]);
    await supabase.from('receipts').delete().eq('id', r.id);
    load();
  };

  const totalMB = receipts.reduce((s, r) => s + Number(r.size_bytes ?? 0), 0) / 1024 / 1024;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Receipts</h1>
        <p className="text-sm text-muted-foreground">Bills, invoices, payment screenshots — stored privately</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Files" value={String(receipts.length)} />
        <StatTile label="Storage used" value={`${totalMB.toFixed(1)} MB`} />
        <StatTile label="Attached to items" value={String(receipts.filter((r) => r.entity_id).length)} />
      </div>

      <label
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:bg-accent/40"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
      >
        <input type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
        <span>Drop files here or click to upload — PNG, JPG, WebP or PDF, up to 10 MB each</span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : receipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No receipts yet.</p>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <button onClick={() => view(r)} className="flex items-center gap-2 truncate text-left hover:text-primary">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{r.file_name}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                </button>
                <div className="ml-3 flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <span>{r.entity_type !== 'general' ? r.entity_type.replace(/_/g, ' ') : '—'}</span>
                  <span>{formatDate(r.created_at)}</span>
                  <button onClick={() => remove(r)} className="hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
