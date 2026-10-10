-- Disposable CI database only, after Storage has created its schema.
-- The service role is trusted server access; client grants still require RLS.
grant usage on schema storage to service_role,anon,authenticated;
grant all on all tables in schema storage to service_role;
grant usage,select on all sequences in schema storage to service_role;
grant execute on all functions in schema storage to service_role;
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant select,insert on storage.buckets,storage.objects to anon,authenticated;
-- No client policy is added: private bucket direct reads/uploads remain denied.
