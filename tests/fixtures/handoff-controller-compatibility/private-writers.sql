-- Review patch only. Requires v3 household/binding guards loaded first.
-- Closed by default; exact transaction-scoped activation replaces this only in
-- the additional disposable activation fixture. No generic stopped-user bypass.
create function maintenance_private.allowed_family_attachment_activation(tbl text,before_value jsonb,after_value jsonb)
returns boolean language sql security invoker set search_path='' as $$ select false $$;
revoke all on function maintenance_private.allowed_family_attachment_activation(text,jsonb,jsonb) from public,anon,authenticated,service_role;
create table maintenance_private.private_writer_routes(
 kind text not null,object_id uuid not null,principal uuid not null,primary key(kind,object_id));
alter table maintenance_private.private_writer_routes enable row level security;
revoke all on maintenance_private.private_writer_routes from public,anon,authenticated,service_role;
insert into maintenance_private.private_writer_routes select 'deletion-request',id,user_id from maintenance_private.account_deletion_requests;
insert into maintenance_private.private_writer_routes select 'device',id,user_id from maintenance_private.native_notification_devices;
create function maintenance_private.guard_private_account_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb;old_r jsonb;ids uuid[]:='{}';k text;p uuid;related uuid;route_kind text;record_id uuid;rows_to_check jsonb[];
begin
 if tg_op='UPDATE' and tg_table_name in('product_attachments','attachment_write_attempts')
 and maintenance_private.allowed_family_attachment_activation(tg_table_name,to_jsonb(old),to_jsonb(new)) then return new;end if;
 if tg_op='DELETE' then rows_to_check:=array[to_jsonb(old)];
 elsif tg_op='INSERT' then rows_to_check:=array[to_jsonb(new)];
 else rows_to_check:=array[to_jsonb(old),to_jsonb(new)];end if;
 foreach r in array rows_to_check loop
  foreach k in array array['user_id','uploader_id','owner_id','captured_owner_id'] loop
   if r->>k is not null then ids:=array_append(ids,(r->>k)::uuid);end if;
  end loop;
  if tg_table_name in('account_deletion_objects','deletion_receipt_sessions','deletion_retention_checks') then
   route_kind:='deletion-request';related:=(r->>'request_id')::uuid;
  elsif tg_table_name='native_notification_jobs' then
   route_kind:='device';related:=(r->>'device_id')::uuid;
  else route_kind:=null;related:=null;end if;
  if route_kind is not null then
   select x.principal into p from maintenance_private.private_writer_routes x where x.kind=route_kind and x.object_id=related;
   if p is null then raise exception 'Missing private principal route';end if;
   ids:=array_append(ids,p);
  end if;
  -- Attachments are also household writes: include current owner and retained hold.
  if tg_table_name='product_attachments' then
   select h.owner_id into p from public.products x join public.homes h on h.id=x."homeId" where x.id=(r->>'product_id')::uuid;
   if p is null then
    select x.owner_id into p from maintenance_private.household_write_routes x where x.kind='products' and x.object_id=(r->>'product_id')::uuid;
   end if;
   if p is null then raise exception 'Missing attachment home route';end if;
   ids:=array_append(ids,p);
   select hold.principal into p from maintenance_private.household_family_holds hold join maintenance_private.household_write_routes rt on rt.home_id=hold.home_id and rt.kind='products' where rt.object_id=(r->>'product_id')::uuid;
   if p is not null then ids:=array_append(ids,p);end if;
  end if;
 end loop;
 -- Nullable, unassociated verified Apple inbox items have no user principal.
 -- Their existing verified-ingestion grants/checks remain required; no client grant is added.
 if cardinality(ids)>0 then
  perform maintenance_private.assert_household_principals(ids,tg_table_name,tg_op,null,null);
 end if;
 if tg_op<>'DELETE' and tg_table_name in('account_deletion_requests','native_notification_devices') then
  r:=to_jsonb(new);p:=(r->>'user_id')::uuid;record_id:=(r->>'id')::uuid;
  route_kind:=case when tg_table_name='account_deletion_requests' then 'deletion-request' else 'device' end;
  insert into maintenance_private.private_writer_routes as x values(route_kind,record_id,p)
   on conflict(kind,object_id) do update set principal=excluded.principal where x.principal=excluded.principal;
  if not found then raise exception 'Immutable private object principal';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function maintenance_private.guard_private_account_write() from public,anon,authenticated,service_role;

create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."account_access" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."account_deletion_objects" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."account_deletion_requests" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."app_epochs" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."app_session_epochs" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."attachment_write_attempts" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."attest_registration_challenges" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."deletion_receipt_sessions" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."deletion_retention_checks" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."enrollment_consents" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."native_delivery_identities" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."native_notification_devices" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."native_notification_jobs" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."notification_channels" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."product_attachments" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."reconciliation_jobs" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."reminder_schedules" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."restore_attested_keys" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."restore_cancelled_requests" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."restore_challenges" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."restore_transfer_jobs" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."transaction_ownership" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."verified_notifications" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."verified_renewals" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "maintenance_private"."verified_transactions" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "public"."maintenance_push_subscriptions" for each row execute function maintenance_private.guard_private_account_write();
create trigger private_account_write_fence before insert or update or delete on "public"."maintenance_push_test_limits" for each row execute function maintenance_private.guard_private_account_write();
