-- Fixed original native guard semantics, local fixture only.
create function maintenance_private.legacy_native_write_for_requested_provenance(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from maintenance_private.shared_native_stage_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current()) then return false;end if;
 -- An active but mismatched/expired capability cannot fall back to ordinary
 -- writer privileges, including for an unrelated principal that is still open.
 if maintenance_private.shared_native_stage_write_matches(sch,tbl,op,prior,next_value) is distinct from true then raise exception 'Native stage write refused';end if;
 return true;
end $$;
revoke all on function maintenance_private.legacy_native_write_for_requested_provenance(text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role,shared_retirement_backend;
