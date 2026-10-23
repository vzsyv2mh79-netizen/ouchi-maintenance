begin;
-- Readback only. A request ID is a locator, never a credential or consent.
-- The HTTP caller must first verify current Auth and the deployed MFA policy.
create function public.read_maintenance_home_handoff(
 target_request uuid,target_user uuid,verified_session uuid,expected_epoch uuid)
 returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare item maintenance_private.home_handoffs;
begin
 if target_request is null or target_user is null or verified_session is null or expected_epoch is null
 or not exists(select 1 from maintenance_private.home_handoff_policy where id=1 and enabled)
 or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from expected_epoch
 then return null; end if;
 select * into item from maintenance_private.home_handoffs
 where id=target_request and ((owner_id=target_user and owner_epoch=expected_epoch)
 or (recipient_id=target_user and recipient_epoch=expected_epoch));
 if not found then return null; end if;
 -- An old successful decision is not proof of the household's current owner.
 if item.state='completed' and not exists(select 1 from public.homes where id=item.home_id and owner_id=item.recipient_id)
 then return null; end if;
 return jsonb_build_object('requestID',item.id,'homeID',item.home_id,
 'state',case when item.state='pending' and item.expires_at<=statement_timestamp() then 'expired' else item.state end,
 'expiresAt',item.expires_at);
end;$$;
revoke all on function public.read_maintenance_home_handoff(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_home_handoff(uuid,uuid,uuid,uuid) to service_role;
commit;
