-- Isolated integration candidate only. This binds the dedicated Auth holder
-- to factual terminal state; it does NOT authorize HMAC15 or final COMMIT.
-- Install after controlled stage0 history and the original terminal facts.
create role ouchi_controlled_terminal_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema private,maintenance_private to ouchi_controlled_terminal_owner;
grant select on private.kb_generation_joint_terminal_contexts to ouchi_controlled_terminal_owner;
create policy controlled_terminal_context_read on private.kb_generation_joint_terminal_contexts
 for select to ouchi_controlled_terminal_owner using(true);
grant execute on function private.kb_read_controlled_generation_provenance(uuid,jsonb),private.kb_lock_controlled_operation(jsonb),private.kb_generation_terminal_actual_facts(uuid,jsonb,uuid) to ouchi_controlled_terminal_owner;
grant execute on function maintenance_private.read_controlled_family_preparation_binding(uuid,jsonb,uuid,text) to ouchi_controlled_terminal_owner;

create function private.kb_verify_controlled_generation_terminal_exclusion_root(r uuid,token uuid,s jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare c private.kb_generation_joint_terminal_contexts;h record;locked_h record;b record;facts jsonb;
begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none'
 or r is null or token is null or s is null or s->>'requestID' is distinct from r::text
 or s->>'leaseToken' is distinct from token::text then return false;end if;
 -- Discovery is not authority. Acquire original operation before calling the
 -- factual reader, which obtains the root lock. Never switch to a new epoch.
 select * into strict c from private.kb_generation_joint_terminal_contexts
 where request_id=r and scope=s and backend_pid=pg_backend_pid() and transaction_id=txid_current();
 select * into strict h from private.kb_read_controlled_generation_provenance(c.generation_id,s);
 if h.provenance->>'domain' is distinct from 'Kakei/shared-retirement/controlled-generation/v1'
 or h.provenance->>'generationID' is distinct from c.generation_id::text
 or h.provenance->'scope' is distinct from s
 or h.producer_xid=txid_current()::text
 or private.kb_lock_controlled_operation(h.provenance->'operation') is distinct from true then return false;end if;
 select * into strict locked_h from private.kb_read_controlled_generation_provenance(c.generation_id,s);
 if to_jsonb(h) is distinct from to_jsonb(locked_h) then return false;end if;
 select * into strict b from maintenance_private.read_controlled_family_preparation_binding(r,s,c.generation_id,h.provenance->>'digest');
 if b.kind is distinct from 'controlled-family-preparation-history'
 or b.native_lease is distinct from c.native_lease
 or b.provenance_digest is distinct from h.provenance->>'digest'
 or b.header_pid is distinct from h.producer_pid or b.header_xid is distinct from h.producer_xid
 or b.producer_xid=txid_current()::text then return false;end if;
 -- Preserve every original terminal check, including deadlines, actual
 -- Auth absence, retained family images and pending notification custody.
 facts:=private.kb_generation_terminal_actual_facts(c.generation_id,s,c.native_lease);
 return facts is not null
 and facts->>'kind'='generation-joint-terminal-actual-facts'
 and facts->'scope'=s and facts->>'generationID'=c.generation_id::text
 and facts->>'nativeLease'=c.native_lease::text
 and facts->>'producerPID'=pg_backend_pid()::text
 and facts->>'producerXID'=txid_current()::text;
exception when no_data_found or too_many_rows then return false;
end$$;
alter function private.kb_verify_controlled_generation_terminal_exclusion_root(uuid,uuid,jsonb) owner to ouchi_controlled_terminal_owner;
revoke all on function private.kb_verify_controlled_generation_terminal_exclusion_root(uuid,uuid,jsonb) from public,anon,authenticated,service_role,ouchi_auth_exclusion_backend;
grant execute on function private.kb_verify_controlled_generation_terminal_exclusion_root(uuid,uuid,jsonb) to shared_retirement_backend;
