-- Local fixture only. New context and trigger changes require separate review.
-- No grants, public RPC, impersonated auth.uid or production deployment.
create table private.kb_shared_handoff_context (
 transaction_id bigint not null,request_id uuid not null,lease_token uuid not null,
 household_id uuid not null,owner_id uuid not null,successor_id uuid not null,
 primary key(transaction_id,household_id),check(owner_id<>successor_id)
);
alter table private.kb_shared_handoff_context enable row level security;
revoke all on private.kb_shared_handoff_context from public,anon,authenticated,service_role;
create function private.kb_shared_handoff_allowed(h uuid,o uuid,n uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.kb_shared_handoff_context c
 join private.kb_shared_deletion_journal j on j.request_id=c.request_id
 join private.kb_shared_handoff_plans p on p.request_id=j.request_id and p.household_id=c.household_id
 where c.transaction_id=txid_current() and c.household_id=h and c.owner_id=o and c.successor_id=n
 and j.user_id=o and j.status='processing' and j.lease_token=c.lease_token and j.lease_until>clock_timestamp()
 and j.receipts ? 'prepare' and not j.receipts ? 'handoff-family'
 and p.plan->>'userID'=o::text and p.plan->>'successorID'=n::text)
$$;
revoke all on function private.kb_shared_handoff_allowed(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function private.kb_touch_household() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.kb_deletion_context where user_id=old.owner_id and transaction_id=txid_current() and user_id=(select auth.uid()))
 and not private.kb_shared_handoff_allowed(old.id,old.owner_id,new.owner_id) then new.owner_id=old.owner_id;end if;
 new.invite_token=old.invite_token;new.created_at=old.created_at;new.updated_at=now();return new;
end $$;
create or replace function private.kb_touch_member() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.household_id=old.household_id;new.user_id=old.user_id;new.joined_at=old.joined_at;
 if not exists(select 1 from private.kb_deletion_context where transaction_id=txid_current() and user_id=(select auth.uid()))
 and not exists(select 1 from private.kb_shared_handoff_context c where c.transaction_id=txid_current() and c.household_id=old.household_id
 and private.kb_shared_handoff_allowed(c.household_id,c.owner_id,c.successor_id)
 and ((old.user_id=c.owner_id and new.role='member') or (old.user_id=c.successor_id and new.role='owner'))) then new.role=old.role;end if;
 return new;
end $$;
