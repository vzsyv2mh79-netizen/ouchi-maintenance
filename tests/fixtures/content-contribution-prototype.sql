-- Disposable experiment only. Not a deployment migration or a deletion worker.
-- Known contributors are a conservative superset, never proof of sole authorship.
-- This observes database writers, not the authors/subjects of pasted or imported
-- text. unknown_contributor=false means observed write coverage only, never that
-- all associated people are known. No erasure decision may rely on this alone.
create schema if not exists maintenance_private;
create table maintenance_private.content_fields (
  relation_name text not null check(relation_name in ('homes','products','maintenance_tasks','maintenance_history')),
  record_id uuid not null,
  field_name text not null,
  unknown_contributor boolean not null,
  primary key(relation_name,record_id,field_name)
);
create table maintenance_private.content_contributors (
  relation_name text not null, record_id uuid not null, field_name text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  primary key(relation_name,record_id,field_name,user_id),
  foreign key(relation_name,record_id,field_name)
    references maintenance_private.content_fields on delete cascade
);
create index content_contributors_user on maintenance_private.content_contributors(user_id);
alter table maintenance_private.content_fields enable row level security;
alter table maintenance_private.content_contributors enable row level security;
revoke all on maintenance_private.content_fields,maintenance_private.content_contributors from public,anon,authenticated,service_role;

create function maintenance_private.capture_content_contribution() returns trigger
language plpgsql security definer set search_path='' as $$
declare payload jsonb; prior jsonb; item record; actor uuid; row_id uuid;
begin
  if tg_table_schema<>'public' or tg_table_name not in ('homes','products','maintenance_tasks','maintenance_history') then
    raise exception 'Unsupported contribution source';
  end if;
  if tg_op='DELETE' then
    delete from maintenance_private.content_fields where relation_name=tg_table_name and record_id=old.id;
    return null;
  end if;
  payload=to_jsonb(new); row_id=(payload->>'id')::uuid; actor=auth.uid();
  if tg_op='UPDATE' then
    prior=to_jsonb(old);
    if old.id<>new.id then raise exception 'Record identity cannot change'; end if;
  end if;
  for item in select * from jsonb_each(payload) where key not in ('id','homeId','productId','taskId','owner_id') loop
    if tg_op='UPDATE' and item.value is not distinct from prior->item.key then continue; end if;
    -- Clearing a value also removes its live-content provenance, in this transaction.
    -- No assertion about provider backups or external exports follows from this.
    if item.value='null'::jsonb or item.value='""'::jsonb then
      delete from maintenance_private.content_fields where relation_name=tg_table_name and record_id=row_id and field_name=item.key;
      continue;
    end if;
    insert into maintenance_private.content_fields values(tg_table_name,row_id,item.key,actor is null)
      on conflict(relation_name,record_id,field_name) do update
      set unknown_contributor=maintenance_private.content_fields.unknown_contributor or excluded.unknown_contributor;
    if actor is not null then
      insert into maintenance_private.content_contributors values(tg_table_name,row_id,item.key,actor) on conflict do nothing;
    end if;
  end loop;
  return null;
end; $$;
revoke all on function maintenance_private.capture_content_contribution() from public,anon,authenticated,service_role;

-- Locking, upgrade ordering, worker coverage and privileged bypass remain unproven.
-- Existing values are explicitly unknown; the current owner is not an author proxy.
do $$ declare relation text; begin
  foreach relation in array array['homes','products','maintenance_tasks','maintenance_history'] loop
    execute format('insert into maintenance_private.content_fields select %L,t.id,v.key,true from public.%I t cross join lateral jsonb_each(to_jsonb(t)) v where v.key not in (''id'',''homeId'',''productId'',''taskId'',''owner_id'') and v.value not in (''null''::jsonb,''""''::jsonb)',relation,relation);
    execute format('create trigger capture_content_contribution after insert or update or delete on public.%I for each row execute function maintenance_private.capture_content_contribution()',relation);
  end loop;
end; $$;
