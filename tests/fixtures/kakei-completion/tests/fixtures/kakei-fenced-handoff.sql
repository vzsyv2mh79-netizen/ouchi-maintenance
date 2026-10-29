-- Local-only composition of financial gates and the protected handoff port.
-- No cleanup/Auth-cascade bypass, client/service grant or production migration.
create or replace function private.kb_allowed_financial_handoff(table_name text,before_row jsonb,after_row jsonb) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from private.kb_shared_handoff_context c
 join private.kb_shared_deletion_journal j on j.request_id=c.request_id
 join private.kb_shared_write_fences u on u.target_kind='user' and u.target_id=c.owner_id
 join private.kb_shared_write_fences h on h.target_kind='household' and h.target_id=c.household_id
 where c.transaction_id=txid_current()
 and private.kb_shared_handoff_allowed(c.household_id,c.owner_id,c.successor_id)
 and u.request_id=j.request_id and h.request_id=j.request_id
 and u.scope=j.scope and h.scope=j.scope
 and u.household_ids=h.household_ids and c.household_id=any(u.household_ids)
 -- A successor closing their own account cannot receive a retained family.
 and not exists(select 1 from private.kb_shared_write_fences blocked
  where blocked.target_kind='user' and blocked.target_id=c.successor_id)
 and j.receipts->'prepare'->>'durable'='true'
 and j.receipts->'prepare'->>'stage'='prepare'
 and ((j.receipts->'prepare')-'durable'-'stage')=j.scope
 and (
  (table_name='kb_households'
   and before_row->>'id'=c.household_id::text
   and before_row->>'owner_id'=c.owner_id::text
   and after_row->>'owner_id'=c.successor_id::text
   -- updated_at is maintained by the existing touch trigger.
   and (before_row-'owner_id'-'updated_at')=(after_row-'owner_id'-'updated_at'))
  or (table_name='kb_household_members'
   and before_row->>'household_id'=c.household_id::text
   and (before_row-'role')=(after_row-'role')
   and ((before_row->>'user_id'=c.owner_id::text and before_row->>'role'='owner' and after_row->>'role'='member')
    or (before_row->>'user_id'=c.successor_id::text and before_row->>'role'='member' and after_row->>'role'='owner')))
 ))
$$;
revoke all on function private.kb_allowed_financial_handoff(text,jsonb,jsonb) from public;
