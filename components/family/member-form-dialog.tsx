'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Check, Share2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { inviteMemberSchema, updateMemberSchema, type InviteMemberInput, type UpdateMemberInput } from '@/lib/validations/family';
import { friendlyError } from '@/lib/errors';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { FamilyMember } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: FamilyMember | null;
}

function inviteUrl(token: string) {
  const base =
    (typeof window !== 'undefined' && window.location.origin) ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    '';
  return `${base}/join/${token}`;
}

export function MemberFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const { currentFamily } = useFamily();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<{ url: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const schema = editing ? updateMemberSchema : inviteMemberSchema;
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteMemberInput & UpdateMemberInput>({
    resolver: zodResolver(schema as any),
    defaultValues: { role: 'member' },
  });

  useEffect(() => {
    if (!open) { setInviteLink(null); setServerError(null); setCopied(false); }
    reset(
      editing
        ? { displayName: editing.display_name, relationship: editing.relationship ?? '', role: editing.role, email: editing.invited_email ?? '' }
        : { role: 'member' }
    );
  }, [open, editing, reset]);

  const onSubmit = async (data: InviteMemberInput & UpdateMemberInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();

    if (editing) {
      const { error } = await supabase
        .from('family_members')
        .update({ display_name: data.displayName, relationship: data.relationship || null, role: data.role })
        .eq('id', editing.id);
      setIsSubmitting(false);
      if (error) return setServerError(friendlyError(error));
      onOpenChange(false);
      onSaved();
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: row, error } = await supabase
      .from('family_members')
      .insert({
        family_id: currentFamily.id,
        display_name: data.displayName,
        invited_email: data.email || null,
        relationship: data.relationship || null,
        role: data.role,
        status: 'invited',
        invited_by: user!.id,
        invite_expires_at: new Date(Date.now() + 14 * 864e5).toISOString(),
      })
      .select('invite_token')
      .single();

    setIsSubmitting(false);
    if (error || !row?.invite_token) return setServerError(friendlyError(error ?? 'Could not create invite'));

    setInviteLink({ url: inviteUrl(row.invite_token), name: data.displayName });
    onSaved();
  };

  const copy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Member' : inviteLink ? 'Invite ready' : 'Invite Family Member'}</DialogTitle>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this link with <b>{inviteLink.name}</b>. When they open it and sign in, they join
              your family. The link expires in 14 days.
            </p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
              <code className="flex-1 truncate text-xs">{inviteLink.url}</code>
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" className="flex-1">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Join our family on Family Finance: ${inviteLink.url}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Share2 className="mr-1 h-4 w-4" /> WhatsApp
                </a>
              </Button>
              <Button className="flex-1" onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Name</Label>
              <Input id="displayName" placeholder="e.g. Rahim Uddin" {...register('displayName')} />
              {errors.displayName && <p className="text-sm text-destructive">{errors.displayName.message}</p>}
            </div>

            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input id="email" type="email" placeholder="member@example.com" {...register('email')} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                <p className="text-xs text-muted-foreground">
                  You&apos;ll get a link to send them — by WhatsApp, email, or however you like.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="relationship">Relationship</Label>
              <Input id="relationship" placeholder="e.g. Spouse, Father, Son" {...register('relationship')} />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {serverError && <p className="text-sm text-destructive">{serverError}</p>}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : editing ? 'Update member' : 'Create invite link'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
