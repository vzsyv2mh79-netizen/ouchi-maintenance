-- TEST ONLY. Bind additional real Auth sessions to an existing active app epoch.
-- Never auto-enroll a closed app identity or transfer a previously bound session.
grant usage on schema auth to service_role;
grant select on auth.sessions to service_role;
create or replace function public.current_maintenance_purchase_account(target_user uuid,verified_session uuid) returns uuid
language plpgsql volatile security invoker set search_path='' as $$
declare current_epoch uuid; bound_epoch uuid;
begin
 if target_user is null or verified_session is null then return null; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not exists(select 1 from auth.sessions s where s.id=verified_session and s.user_id=target_user and (s.not_after is null or s.not_after>now())) then return null; end if;
 select a.epoch_id into current_epoch from maintenance_private.app_epochs a
 join maintenance_private.account_access x on x.user_id=a.user_id and x.enabled
 where a.user_id=target_user and a.enabled;
 if current_epoch is null then return null; end if;
 insert into maintenance_private.app_session_epochs(session_id,user_id,epoch_id)
 values(verified_session,target_user,current_epoch) on conflict(session_id) do nothing;
 select epoch_id into bound_epoch from maintenance_private.app_session_epochs
 where session_id=verified_session and user_id=target_user;
 if bound_epoch is distinct from current_epoch then return null; end if;
 return current_epoch;
end;$$;
revoke all on function public.current_maintenance_purchase_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.current_maintenance_purchase_account(uuid,uuid) to service_role;
