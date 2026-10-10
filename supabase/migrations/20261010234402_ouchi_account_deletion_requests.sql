begin;
-- Durable request only. No production endpoint, worker, deletion or completion
-- transition is enabled by this migration. API must verify Auth.getUser AND
-- recent reauthentication before invoking the service-only enqueue function.
create table maintenance_private.account_deletion_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 app_epoch_id uuid not null,
 state text not null default 'pending' check(state in ('pending','running','complete','failed')),
 requested_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,app_epoch_id)
);
alter table maintenance_private.account_deletion_requests enable row level security;
revoke all on maintenance_private.account_deletion_requests from public,anon,authenticated;
grant select,insert on maintenance_private.account_deletion_requests to service_role;
create function public.request_maintenance_account_deletion(target_user uuid,verified_session uuid,target_epoch uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare current_epoch uuid; request_id uuid;
begin
 if target_user is null or verified_session is null or target_epoch is null then raise exception 'Invalid deletion identity'; end if;
 -- Same lock used by app enrollment: an old request never becomes a new epoch.
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 current_epoch:=public.current_maintenance_purchase_account(target_user,verified_session);
 if current_epoch is null or current_epoch<>target_epoch then raise exception 'Live app session required'; end if;
 insert into maintenance_private.account_deletion_requests(user_id,app_epoch_id)
 values(target_user,target_epoch) on conflict(user_id,app_epoch_id) do nothing;
 select id into request_id from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=target_epoch;
 return request_id;
end;$$;
revoke all on function public.request_maintenance_account_deletion(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_maintenance_account_deletion(uuid,uuid,uuid) to service_role;
commit;
