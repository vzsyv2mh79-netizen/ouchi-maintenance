-- Dormant read-only role. No LOGIN, secret, enabled operator principal, policy
-- activation or public endpoint is created. Scope checks stay in each helper.
begin;
create role ouchi_closure_inspector nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema maintenance_private to ouchi_closure_inspector;
grant execute on function
 maintenance_private.closure_operator_queue(uuid),
 maintenance_private.closure_review_field_inventory(uuid,uuid,uuid,text),
 maintenance_private.read_closure_redaction_field(uuid,uuid,uuid,text,uuid,text),
 maintenance_private.closure_review_file_inventory(uuid,uuid,uuid,uuid),
 maintenance_private.closure_review_household_file_inventory(uuid,uuid,uuid,uuid)
to ouchi_closure_inspector;
comment on role ouchi_closure_inspector is 'Ouchi scoped operator inspection only; no raw-table or decision/erasure grants';
commit;
