begin;
create function public.read_maintenance_reconciliation_status(target_user uuid,verified_session uuid,target_epoch uuid,target_environment text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare binding uuid;job maintenance_private.reconciliation_jobs;
begin
 if target_environment is null or target_environment not in ('Sandbox','Production') then raise exception 'Invalid recovery environment'; end if;
 binding:=public.current_maintenance_purchase_account(target_user,verified_session);
 if binding is null or target_epoch is null or binding<>target_epoch then raise exception 'Recovery enrollment unavailable'; end if;
 select * into job from maintenance_private.reconciliation_jobs where user_id=target_user and app_epoch_id=target_epoch and environment=target_environment;
 if not found then return jsonb_build_object('state','none','environment',target_environment); end if;
 -- Progress is not a purchase or entitlement. Never expose a lease, transaction ID or provider error.
 return jsonb_build_object('state',job.state,'environment',job.environment);
end;$$;
revoke all on function public.read_maintenance_reconciliation_status(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_maintenance_reconciliation_status(uuid,uuid,uuid,text) to service_role;
commit;
