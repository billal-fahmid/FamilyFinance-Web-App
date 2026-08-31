'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Shield, Link2, Check, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MemberFormDialog } from '@/components/family/member-form-dialog';
import type { FamilyMember } from '@/types/database';

const ROLE_LABEL: Record<FamilyMember['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

export default function FamilyPage() {
  const { currentFamily, currentRole } = useFamily();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const inviteUrlFor = (m: FamilyMember) => `${window.location.origin}/join/${m.invite_token}`;

  const copyInvite = async (m: FamilyMember) => {
    if (!m.invite_token) return;
    try {
      await navigator.clipboard.writeText(inviteUrlFor(m));
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const whatsappInvite = (m: FamilyMember) => {
    if (!m.invite_token) return;
    const text = `Join our family on Family Finance: ${inviteUrlFor(m)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const isAdmin = currentRole === 'owner' || currentRole === 'admin';

  const load = useCallback(async () => {
    if (!currentFamily) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', currentFamily.id)
      .neq('status', 'removed')
      .order('created_at', { ascending: true });
    setMembers((data as FamilyMember[]) ?? []);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Remove this member from the family?')) return;
    const supabase = createClient();
    await supabase.from('family_members').update({ status: 'removed' }).eq('id', id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{currentFamily?.name}</h1>
          <p className="text-sm text-muted-foreground">{members.length} member{members.length !== 1 && 's'}</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Invite Member
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <Card key={m.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {m.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{m.display_name}</p>
                    <p className="text-xs text-muted-foreground">{m.relationship || '—'}</p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(m); setDialogOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {m.role !== 'owner' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{ROLE_LABEL[m.role]}</span>
                {m.status === 'invited' && (
                  <span className="rounded-full bg-brand-gold/20 px-2 py-0.5 font-medium text-amber-700">
                    Invited
                  </span>
                )}
              </div>
              {isAdmin && m.status === 'invited' && m.invite_token && (
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => copyInvite(m)}>
                    {copiedId === m.id ? (
                      <><Check className="mr-1 h-3.5 w-3.5" /> Copied</>
                    ) : (
                      <><Link2 className="mr-1 h-3.5 w-3.5" /> Copy link</>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => whatsappInvite(m)}>
                    <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <MemberFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} editing={editing} />
    </div>
  );
}
