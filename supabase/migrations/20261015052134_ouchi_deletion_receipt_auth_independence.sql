begin;
-- Dormant candidate. A sealed native receipt must survive shared Auth erasure;
-- CASCADE would destroy evidence and SET NULL would change its fixed actor.
-- Keep NOT NULL, RLS, all grants and the existing live-session enqueue checks.
-- Direct privileged DML is not an authorized intake or completion protocol.
do $$
begin
 if not exists(select 1 from pg_catalog.pg_constraint c
  where c.conrelid='maintenance_private.account_deletion_requests'::regclass
   and c.conname='account_deletion_requests_user_id_fkey' and c.contype='f'
   and c.confrelid='auth.users'::regclass
   and c.conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=c.conrelid and attname='user_id')]::smallint[]
   and c.confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=c.confrelid and attname='id')]::smallint[])
 then raise exception 'Expected deletion actor reference missing; review schema history';end if;
end $$;
alter table maintenance_private.account_deletion_requests
 drop constraint account_deletion_requests_user_id_fkey;

create function maintenance_private.keep_deletion_request_actor()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if row(new.id,new.user_id,new.app_epoch_id,new.requested_at)
  is distinct from row(old.id,old.user_id,old.app_epoch_id,old.requested_at)
 then raise exception 'Deletion request actor and original acceptance are immutable';end if;
 return new;
end $$;
revoke all on function maintenance_private.keep_deletion_request_actor() from public,anon,authenticated,service_role;
-- Preserve the earlier stopped-writer guards' first refusal where applicable.
create trigger zz_deletion_request_actor_immutable
 before update on maintenance_private.account_deletion_requests
 for each row execute function maintenance_private.keep_deletion_request_actor();
commit;
