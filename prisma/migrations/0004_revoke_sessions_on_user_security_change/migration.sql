create function public.revoke_sessions_on_user_security_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  revocation_reason text;
begin
  revocation_reason := case
    when new.password_hash is distinct from old.password_hash then 'PASSWORD_CHANGED'
    when new.role is distinct from old.role then 'ROLE_CHANGED'
    else 'ACCOUNT_STATUS_CHANGED'
  end;

  update public.sessions
  set
    revoked_at = clock_timestamp(),
    revoked_reason = revocation_reason
  where user_id = new.id
    and revoked_at is null;

  return new;
end;
$$;

revoke all on function public.revoke_sessions_on_user_security_change() from public;

create trigger users_20_revoke_sessions_on_security_change
after update of password_hash, role, is_active on public.users
for each row
when (
  old.password_hash is distinct from new.password_hash
  or old.role is distinct from new.role
  or old.is_active is distinct from new.is_active
)
execute function public.revoke_sessions_on_user_security_change();
