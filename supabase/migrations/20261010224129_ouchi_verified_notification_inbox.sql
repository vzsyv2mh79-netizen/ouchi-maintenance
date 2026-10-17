-- Additive inbox for verified Apple notifications. No sales activation.
begin;
create table maintenance_private.verified_notifications (
 environment text not null check (environment in ('Sandbox','Production')),
 notification_id uuid not null check (notification_id <> '00000000-0000-0000-0000-000000000000'::uuid),
 notification_type text not null check (notification_type ~ '^[A-Z_]{1,80}$'),
 subtype text check (subtype ~ '^[A-Z_]{1,80}$'),
 signed_at bigint not null check (signed_at > 0 and signed_at <= 9007199254740991),
 proof_sha256 text not null check (proof_sha256 ~ '^[0-9a-f]{64}$'),
 disposition text not null check (disposition in ('test','transaction_applied','needs_reconciliation')),
 received_at timestamptz not null default now(),
 primary key (environment,notification_id)
);
alter table maintenance_private.verified_notifications enable row level security;
revoke all on maintenance_private.verified_notifications from public,anon,authenticated;
grant select,insert on maintenance_private.verified_notifications to service_role;
create function public.record_maintenance_verified_notification(payload jsonb, proof_sha256 text)
returns text language plpgsql security invoker set search_path='' as $$
declare
 inserted uuid;
 prior maintenance_private.verified_notifications%rowtype;
begin
 if payload is null or jsonb_typeof(payload) <> 'object' or proof_sha256 is null then
  raise exception 'Invalid notification';
 end if;
 insert into maintenance_private.verified_notifications(environment,notification_id,notification_type,subtype,signed_at,proof_sha256,disposition)
 values(payload->>'environment',(payload->>'notificationId')::uuid,payload->>'notificationType',payload->>'subtype',(payload->>'signedAt')::bigint,proof_sha256,payload->>'disposition')
 on conflict(environment,notification_id) do nothing returning notification_id into inserted;
 if inserted is not null then return 'inserted'; end if;
 select * into prior from maintenance_private.verified_notifications
 where environment=payload->>'environment' and notification_id=(payload->>'notificationId')::uuid;
 if not found or prior.proof_sha256 <> proof_sha256
  or prior.notification_type <> payload->>'notificationType'
  or prior.subtype is distinct from payload->>'subtype'
  or prior.signed_at <> (payload->>'signedAt')::bigint
  or prior.disposition <> payload->>'disposition' then
  raise exception 'Notification identity conflict';
 end if;
 return 'duplicate';
end;
$$;
revoke all on function public.record_maintenance_verified_notification(jsonb,text) from public,anon,authenticated;
grant execute on function public.record_maintenance_verified_notification(jsonb,text) to service_role;
commit;
