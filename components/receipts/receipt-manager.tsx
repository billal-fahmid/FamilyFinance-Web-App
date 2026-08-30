'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, FileText, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import type { Receipt, ReceiptEntityType } from '@/types/database';

interface Props {
  entityType: ReceiptEntityType;
  entityId?: string | null;
  compact?: boolean;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';
const MAX = 10 * 1024 * 1024;

export function ReceiptManager({ entityType, entityId, compact }: Props) {
  const { currentFamily } = useFamily();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    const supabase = createClient();
    let q = supabase
      .from('receipts')
      .select('*')
      .eq('family_id', currentFamily.id)
      .eq('entity_type', entityType)
      .order('created_at', { ascending: false });
    if (entityId) q = q.eq('entity_id', entityId);
    const { data } = await q;
    setReceipts((data as Receipt[]) ?? []);
  }, [currentFamily, entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (file: File) => {
    if (!currentFamily) return;
    if (file.size > MAX) return setError('File must be 10 MB or smaller.');
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const path = `${currentFamily.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, '_')}`;

    const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) {
      setBusy(false);
      return setError(upErr.message);
    }

    const { error: metaErr } = await supabase.from('receipts').insert({
      family_id: currentFamily.id,
      uploaded_by: user!.id,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      entity_type: entityType,
      entity_id: entityId ?? null,
    });
    if (metaErr) setError(metaErr.message);
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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
          {compact ? 'Add' : 'Upload receipt'}
        </Button>
        {receipts.length > 0 && <span className="text-xs text-muted-foreground">{receipts.length} attached</span>}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {receipts.length > 0 && (
        <div className="space-y-1">
          {receipts.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
              <button onClick={() => view(r)} className="flex items-center gap-2 truncate text-left hover:text-primary">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{r.file_name}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
              </button>
              <button onClick={() => remove(r)} className="ml-2 shrink-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
