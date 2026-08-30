-- ============================================================================
-- MILESTONE 4b — Real family invitations (shareable join link + accept flow)
-- ============================================================================

set check_function_bodies = off;

alter table public.family_members
  add column if not exists invite_token uuid default uuid_generate_v4(),
  add column if not exists invite_expires_at timestamptz;

-- backfill tokens for any existing pending invites
update public.family_members
  set invite_token = uuid_generate_v4()
  where status = 'invited' and invite_token is null;

create index if not exists idx_family_members_invite_token
  on public.family_members(invite_token) where invite_token is not null;

-- ----------------------------------------------------------------------------
-- accept_family_invite(token) — called by a signed-in user from /join/<token>.
-- SECURITY DEFINER because the invitee is not a family member yet, so RLS
-- would hide the row. Links the pending row to auth.uid() and activates it.
-- ----------------------------------------------------------------------------
create or replace function public.accept_family_invite(token uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  inv public.family_members;
  existing public.family_members;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into inv from public.family_members
    where invite_token = token
      and status = 'invited'
      and (invite_expires_at is null or invite_expires_at > now())
    limit 1;

  if inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  select * into existing from public.family_members
    where family_id = inv.family_id and user_id = auth.uid()
    limit 1;

  if existing.id is not null then
    if existing.status <> 'active' then
      update public.family_members set status = 'active' where id = existing.id;
    end if;
    delete from public.family_members where id = inv.id;
    return jsonb_build_object('ok', true, 'family_id', inv.family_id, 'already_member', true);
  end if;

  update public.family_members
    set user_id = auth.uid(),
        status = 'active',
        invite_token = null,
        invite_expires_at = null
    where id = inv.id;

  return jsonb_build_object('ok', true, 'family_id', inv.family_id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'conflict');
end;
$$;

grant execute on function public.accept_family_invite(uuid) to authenticated;

-- Preview an invite (family + inviter name) without joining — for the /join page.
create or replace function public.peek_family_invite(token uuid)
returns jsonb
language plpgsql
security definer
as $$
declare r record;
begin
  select f.name as family_name, fm.role, fm.display_name,
         coalesce(ib.full_name, 'A family member') as invited_by
    into r
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  left join public.profiles ib on ib.id = fm.invited_by
  where fm.invite_token = token
    and fm.status = 'invited'
    and (fm.invite_expires_at is null or fm.invite_expires_at > now())
  limit 1;

  if r.family_name is null then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'family_name', r.family_name,
                            'role', r.role, 'invited_by', r.invited_by);
end;
$$;

grant execute on function public.peek_family_invite(uuid) to authenticated, anon;

notify pgrst, 'reload schema';
