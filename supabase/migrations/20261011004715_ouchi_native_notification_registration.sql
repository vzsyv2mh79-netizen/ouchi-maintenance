begin;
-- No public registration endpoint is enabled. Server verifies exact bearer first.
alter table maintenance_private.native_notification_devices add column session_id uuid;
create function public.register_maintenance_native_push(target_user uuid,verified_session uuid,expected_epoch uuid,token text,push_environment text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior maintenance_private.native_notification_devices; result uuid;
begin
 if target_user is null or verified_session is null or expected_epoch is null or token is null
 or length(token) not between 32 and 1024 or token !~ '^([0-9a-f]{2})+$'
 or push_environment is null or push_environment not in ('Sandbox','Production') then raise exception 'Invalid registration'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=expected_epoch and enabled)
 or not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user and session_id=verified_session and epoch_id=expected_epoch)
 or not exists(select 1 from auth.sessions where id=verified_session and user_id=target_user and (not_after is null or not_after>now())) then raise exception 'Inactive registration'; end if;
 perform pg_advisory_xact_lock(hashtext(push_environment||':'||token));
 select * into prior from maintenance_private.native_notification_devices where environment=push_environment and topic='jp.ouchi.maintenance' and device_token=token and enabled for update;
 if found then
  if prior.user_id<>target_user or prior.app_epoch_id<>expected_epoch then raise exception 'Destination already bound'; end if;
  if prior.session_id=verified_session then return prior.id; end if;
  -- Replace within the same enrollment; pending work never transfers sessions.
  delete from maintenance_private.native_notification_devices where id=prior.id;
 end if;
 insert into maintenance_private.native_notification_devices(user_id,app_epoch_id,environment,device_token,topic,session_id)
 values(target_user,expected_epoch,push_environment,token,'jp.ouchi.maintenance',verified_session) returning id into result;
 return result;
end;$$;
revoke all on function public.register_maintenance_native_push(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.register_maintenance_native_push(uuid,uuid,uuid,text,text) to service_role;
create function public.maintenance_native_push_allowed(registration_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.native_notification_devices d
 join maintenance_private.account_access a on a.user_id=d.user_id and a.enabled
 join maintenance_private.app_epochs e on e.user_id=d.user_id and e.epoch_id=d.app_epoch_id and e.enabled
 join maintenance_private.app_session_epochs b on b.user_id=d.user_id and b.session_id=d.session_id and b.epoch_id=d.app_epoch_id
 join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id and (s.not_after is null or s.not_after>now())
 where d.id=registration_id and d.enabled);
$$;
revoke all on function public.maintenance_native_push_allowed(uuid) from public,anon,authenticated;
grant execute on function public.maintenance_native_push_allowed(uuid) to service_role;
create function public.disable_maintenance_native_push(target_user uuid,verified_session uuid,expected_epoch uuid,registration_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not exists(select 1 from auth.sessions where id=verified_session and user_id=target_user and (not_after is null or not_after>now()))
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=expected_epoch and enabled)
 or not exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user and session_id=verified_session and epoch_id=expected_epoch) then return false; end if;
 perform 1 from maintenance_private.native_notification_devices where id=registration_id and user_id=target_user and app_epoch_id=expected_epoch and session_id=verified_session for update;
 if not found then return false; end if;
 update maintenance_private.native_notification_devices set enabled=false where id=registration_id;
 delete from maintenance_private.native_notification_jobs where device_id=registration_id;
 return true;
end;$$;
revoke all on function public.disable_maintenance_native_push(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.disable_maintenance_native_push(uuid,uuid,uuid,uuid) to service_role;
commit;
