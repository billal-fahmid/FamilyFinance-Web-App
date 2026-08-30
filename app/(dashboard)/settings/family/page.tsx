'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/components/providers/locale-provider';
import { friendlyError } from '@/lib/errors';

export default function FamilySettingsPage() {
  const { currentFamily, currentRole, refresh } = useFamily();
  const t = useT();
  const [name, setName] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canEdit = currentRole === 'owner' || currentRole === 'admin';

  useEffect(() => {
    if (!currentFamily) return;
    setName(currentFamily.name);
    const supabase = createClient();
    supabase
      .from('family_members')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', currentFamily.id)
      .eq('status', 'active')
      .then(({ count }) => setMemberCount(count ?? 0));
  }, [currentFamily]);

  const save = async () => {
    if (!currentFamily || !canEdit) return;
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.from('families').update({ name: name.trim() }).eq('id', currentFamily.id);
    setSaving(false);
    if (error) return setMsg(friendlyError(error));
    setMsg(t('settings.saved'));
    refresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">{t('settings.family')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="famName">Family name</Label>
            <Input id="famName" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          {canEdit ? (
            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving || !name.trim()}>{saving ? 'Saving…' : t('action.save')}</Button>
              {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Only an owner or admin can rename the family.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Members & roles</CardTitle>
          <p className="text-sm text-muted-foreground">{memberCount} active member{memberCount === 1 ? '' : 's'}</p>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/family"><Users className="mr-2 h-4 w-4" /> Manage members</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
