begin;
-- Four scope rows maximum. Prepared coordinator only; no timer or send is enabled.
create table maintenance_private.native_delivery_sweeps (
 push_environment text not null check(push_environment in ('Sandbox','Production')),
 purchase_environment text not null check(purchase_environment in ('Sandbox','Production')),
 cycle_id uuid not null default gen_random_uuid(),
 delivery_day date not null default ((clock_timestamp() at time zone 'Asia/Tokyo')::date),
 cursor_id uuid,
 lease_id uuid,
 lease_until timestamptz,
 completed_at timestamptz,
 last_status text not null default 'partial' check(last_status in ('complete','partial','unconfirmed')),
 primary key(push_environment,purchase_environment)
);
alter table maintenance_private.native_delivery_sweeps enable row level security;
revoke all on maintenance_private.native_delivery_sweeps from public,anon,authenticated;
grant select,insert,update on maintenance_private.native_delivery_sweeps to service_role;
create function public.claim_maintenance_native_delivery_sweep(target_push_environment text,target_purchase_environment text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare row_sweep maintenance_private.native_delivery_sweeps%rowtype; token uuid; today date;
begin
 if target_push_environment is null or target_push_environment not in ('Sandbox','Production') or target_purchase_environment is null or target_purchase_environment not in ('Sandbox','Production') then raise exception 'Invalid delivery scope'; end if;
 insert into maintenance_private.native_delivery_sweeps(push_environment,purchase_environment) values(target_push_environment,target_purchase_environment) on conflict do nothing;
 select * into row_sweep from maintenance_private.native_delivery_sweeps where push_environment=target_push_environment and purchase_environment=target_purchase_environment for update;
 if row_sweep.lease_until>clock_timestamp() then return null; end if;
 today:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
 if row_sweep.delivery_day=today and row_sweep.last_status='complete' and row_sweep.completed_at>clock_timestamp()-interval '5 minutes' then return null; end if;
 if row_sweep.delivery_day<>today or row_sweep.last_status='complete' then
  row_sweep.cursor_id:=null;row_sweep.cycle_id:=gen_random_uuid();
 end if;
 token:=gen_random_uuid();
 update maintenance_private.native_delivery_sweeps set cycle_id=row_sweep.cycle_id,delivery_day=today,cursor_id=row_sweep.cursor_id,lease_id=token,lease_until=clock_timestamp()+interval '120 seconds',last_status='partial' where push_environment=target_push_environment and purchase_environment=target_purchase_environment;
 return jsonb_build_object('lease',token,'cycle',row_sweep.cycle_id,'cursor',row_sweep.cursor_id);
end $$;
create function public.maintenance_native_delivery_sweep_current(target_push_environment text,target_purchase_environment text,target_cycle uuid,target_lease uuid) returns boolean
language sql security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.native_delivery_sweeps where push_environment=target_push_environment and purchase_environment=target_purchase_environment and cycle_id=target_cycle and lease_id=target_lease and lease_until>clock_timestamp() and delivery_day=(clock_timestamp() at time zone 'Asia/Tokyo')::date);
$$;
create function public.checkpoint_maintenance_native_delivery_sweep(target_push_environment text,target_purchase_environment text,target_cycle uuid,target_lease uuid,expected_cursor uuid,next_cursor uuid,result_status text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare row_sweep maintenance_private.native_delivery_sweeps%rowtype;
begin
 if result_status is null or result_status not in ('complete','partial','unconfirmed') or next_cursor='00000000-0000-0000-0000-000000000000'::uuid then return false; end if;
 select * into row_sweep from maintenance_private.native_delivery_sweeps where push_environment=target_push_environment and purchase_environment=target_purchase_environment for update;
 if not found or not public.maintenance_native_delivery_sweep_current(target_push_environment,target_purchase_environment,target_cycle,target_lease) or row_sweep.cursor_id is distinct from expected_cursor then return false; end if;
 if expected_cursor is not null and (next_cursor is null or next_cursor<expected_cursor) then return false; end if;
 update maintenance_private.native_delivery_sweeps set cursor_id=next_cursor,last_status=result_status,lease_id=null,lease_until=null,completed_at=case when result_status='complete' then clock_timestamp() else completed_at end where push_environment=target_push_environment and purchase_environment=target_purchase_environment;
 return true;
end $$;
revoke all on function public.claim_maintenance_native_delivery_sweep(text,text),public.maintenance_native_delivery_sweep_current(text,text,uuid,uuid),public.checkpoint_maintenance_native_delivery_sweep(text,text,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_maintenance_native_delivery_sweep(text,text),public.maintenance_native_delivery_sweep_current(text,text,uuid,uuid),public.checkpoint_maintenance_native_delivery_sweep(text,text,uuid,uuid,uuid,uuid,text) to service_role;
commit;
