-- Dormant local candidate. Does not enable reviewed retirement or delete data.
begin;
-- Private gate reads one real policy row; no user-controlled flag can bypass it.
-- The share lock lasts through the invoker RPC, serializing policy activation
-- with any already admitted legacy erasure. Never elevate its actual DELETEs.
create function maintenance_private.require_legacy_maintenance_erasure_allowed()
returns void language plpgsql security definer set search_path='' as $$
declare allowed boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 -- Stop the old path as soon as review intake starts, even before the
 -- later retirement executor is activated. Lock both in a fixed order.
 select not enabled into allowed from maintenance_private.account_closure_review_policy where id=1 for share;
 if allowed is distinct from true then
  raise exception using errcode='P0001',message='Legacy maintenance erasure disabled; use app retirement';
 end if;
 select not enabled into allowed from maintenance_private.reviewed_retirement_policy where id=1 for share;
 if allowed is distinct from true then
  raise exception using errcode='P0001',message='Legacy maintenance erasure disabled; use app retirement';
 end if;
end;$$;
revoke all on function maintenance_private.require_legacy_maintenance_erasure_allowed() from public,anon,authenticated,service_role;
grant execute on function maintenance_private.require_legacy_maintenance_erasure_allowed() to authenticated;

create or replace function public.erase_maintenance_data() returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform maintenance_private.require_legacy_maintenance_erasure_allowed();
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 delete from public.maintenance_push_subscriptions where user_id=auth.uid();
 delete from public.home_members where user_id=auth.uid();
 delete from public.homes where owner_id=auth.uid();
end;$$;
revoke all on function public.erase_maintenance_data() from public,anon;
grant execute on function public.erase_maintenance_data() to authenticated;
commit;
