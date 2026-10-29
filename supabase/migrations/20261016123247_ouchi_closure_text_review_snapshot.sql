-- Dormant text-only snapshot. Neither personal-data discovery nor account erasure clearance.
begin;
-- Owner-only relation used by guarded readers and snapshot capture. It carries
-- live text transiently; snapshots persist hashes, never a second text copy.
-- SECURITY INVOKER; fully qualified relations, no public/operator execute grant.
-- This internal relation is not an independently exposed operator API.
create function maintenance_private.closure_review_text_fields(target_review uuid,target_user uuid,target_epoch uuid)
returns table(home_id uuid,home_instance_id uuid,relation_name text,record_id uuid,field_name text,field_key text,field_value text)
language sql stable security invoker set search_path='' as $$
 with scoped_homes as (
  select h.id as scoped_home from public.homes h where h.owner_id=target_user
  union select m."homeId" from public.home_members m where m.user_id=target_user
  union select distinct e.home_id from maintenance_private.closure_legacy_home_events e
   where e.review_request_id=target_review and e.user_id=target_user and e.app_epoch_id=target_epoch
    and maintenance_private.closure_legacy_home_context_is_current(target_review,target_user,target_epoch,e.home_id)
 ), candidate_fields as (
  select h.id as home_key,'homes'::text as relation_key,h.id as record_key,'name'::text as field_key_name,h.name as field_value
   from public.homes h join scoped_homes s on s.scoped_home=h.id
  union all
  select p."homeId",'products',p.id,v.key,v.value
   from public.products p join scoped_homes s on s.scoped_home=p."homeId"
   cross join lateral (values('name',p.name),('maker',p.maker),('modelNumber',p."modelNumber"),('memo',p.memo)) v(key,value)
  union all
  select p."homeId",'maintenance_tasks',t.id,v.key,v.value
   from public.maintenance_tasks t join public.products p on p.id=t."productId" join scoped_homes s on s.scoped_home=p."homeId"
   cross join lateral (values('name',t.name),('sourceUrl',t."sourceUrl"),('sourceNote',t."sourceNote"),('sourceFrequency',t."sourceFrequency")) v(key,value)
  union all
  select p."homeId",'maintenance_history',h.id,'note',h.note
   from public.maintenance_history h join public.products p on p.id=h."productId" join scoped_homes s on s.scoped_home=p."homeId"
 )
 select c.home_key,i.instance_id,c.relation_key,c.record_key,c.field_key_name,
 c.relation_key||':'||c.record_key::text||':'||c.field_key_name,c.field_value
 from candidate_fields c join maintenance_private.closure_home_instances i on i.home_id=c.home_key
 where c.field_value is not null and c.field_value<>'';
$$;
revoke all on function maintenance_private.closure_review_text_fields(uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;
create or replace function maintenance_private.closure_review_field_inventory(
 target_review uuid,target_user uuid,target_epoch uuid,after_key text default null
) returns table(home_id uuid,relation_name text,record_id uuid,field_name text,field_key text,preview text,content_digest text,truncated boolean)
language plpgsql security definer set search_path='' as $$
declare review maintenance_private.account_closure_reviews;
begin
 if not exists(select 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled)
 then raise exception 'Authorized operator connection required'; end if;
 if target_review is null or target_user is null or target_epoch is null
 or (after_key is not null and (octet_length(after_key)>160 or after_key !~ '^(homes|products|maintenance_tasks|maintenance_history):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(name|maker|modelNumber|memo|sourceUrl|sourceNote|sourceFrequency|note)$'))
 then raise exception 'Scoped inventory cursor required'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 select * into review from maintenance_private.account_closure_reviews where review_request_id=target_review for share;
 if not found or review.user_id<>target_user or review.app_epoch_id<>target_epoch or review.state<>'review_required'
 then raise exception 'Current matching review required'; end if;
 perform 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and enabled for share;
 if not found then raise exception 'Current matching enrollment required'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=target_epoch)
 then raise exception 'Deletion status must be reconciled'; end if;

 return query with limited as (
  select f.* from maintenance_private.closure_review_text_fields(target_review,target_user,target_epoch) f
  where after_key is null or f.field_key collate "C">after_key collate "C"
  order by f.field_key collate "C" limit 51
 )
 select f.home_id,f.relation_name,f.record_id,f.field_name,f.field_key,left(f.field_value,512),
 encode(sha256(convert_to(to_jsonb(f.field_value)::text,'UTF8')),'hex'),char_length(f.field_value)>512
 from limited f order by f.field_key collate "C";
end;$$;
revoke all on function maintenance_private.closure_review_field_inventory(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_field_inventory(uuid,uuid,uuid,text) to ouchi_closure_operator;

create table maintenance_private.closure_text_snapshots (
 plan_id uuid primary key,
 review_request_id uuid not null references maintenance_private.account_closure_reviews(review_request_id) on delete restrict,
 user_id uuid not null, app_epoch_id uuid not null,
 operator_principal name not null, replaces_plan_id uuid,
 state text not null check(state in ('open','superseded')),
 item_count bigint not null default 0 check(item_count>=0),
 captured_at timestamptz not null default clock_timestamp()
);
create unique index closure_text_one_open on maintenance_private.closure_text_snapshots(review_request_id) where state='open';
alter table maintenance_private.closure_text_snapshots enable row level security;
revoke all on maintenance_private.closure_text_snapshots from public,anon,authenticated,service_role,ouchi_closure_operator;
create table maintenance_private.closure_text_snapshot_items (
 plan_id uuid not null references maintenance_private.closure_text_snapshots(plan_id) on delete cascade,
 field_key text not null, home_id uuid not null, home_instance_id uuid not null,
 relation_name text not null,record_id uuid not null,field_name text not null,
 content_digest text not null check(content_digest ~ '^[0-9a-f]{64}$'),
 primary key(plan_id,field_key)
);
alter table maintenance_private.closure_text_snapshot_items enable row level security;
revoke all on maintenance_private.closure_text_snapshot_items from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.require_closure_snapshot_review(target_review uuid,target_user uuid,target_epoch uuid)
returns void language plpgsql security definer set search_path='' as $$
declare review maintenance_private.account_closure_reviews;
begin
 if not exists(select 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled)
 then raise exception 'Authorized operator connection required'; end if;
 if target_review is null or target_user is null or target_epoch is null then raise exception 'Scoped snapshot required'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 select * into review from maintenance_private.account_closure_reviews where review_request_id=target_review for share;
 if not found or review.user_id<>target_user or review.app_epoch_id<>target_epoch or review.state<>'review_required'
 then raise exception 'Current matching review required'; end if;
 perform 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and enabled for share;
 if not found then raise exception 'Current matching enrollment required'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=target_epoch)
 then raise exception 'Deletion status must be reconciled'; end if;
end;$$;
revoke all on function maintenance_private.require_closure_snapshot_review(uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.capture_closure_text_snapshot(target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,replaces_plan uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.closure_text_snapshots; active_plan uuid; affected bigint;
begin
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 if target_plan is null or target_plan='00000000-0000-0000-0000-000000000000'::uuid
 or replaces_plan='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Scoped snapshot ID required'; end if;
 select * into prior from maintenance_private.closure_text_snapshots where plan_id=target_plan;
 if found then
  if prior.review_request_id<>target_review or prior.user_id<>target_user or prior.app_epoch_id<>target_epoch
  or prior.operator_principal<>session_user or prior.replaces_plan_id is distinct from replaces_plan then raise exception 'Snapshot event conflict'; end if;
 else
  select p.plan_id into active_plan from maintenance_private.closure_text_snapshots p where p.review_request_id=target_review and p.state='open' for update;
  if active_plan is distinct from replaces_plan then raise exception 'Current snapshot must be explicitly replaced'; end if;
  if active_plan is not null then update maintenance_private.closure_text_snapshots set state='superseded' where plan_id=active_plan; end if;
  insert into maintenance_private.closure_text_snapshots(plan_id,review_request_id,user_id,app_epoch_id,operator_principal,replaces_plan_id,state)
  values(target_plan,target_review,target_user,target_epoch,session_user,replaces_plan,'open');
  -- ONE SQL read snapshot supplies every stored key, home incarnation and hash.
  -- Do not capture by walking fresh API pages across different snapshots.
  insert into maintenance_private.closure_text_snapshot_items(plan_id,field_key,home_id,home_instance_id,relation_name,record_id,field_name,content_digest)
   select target_plan,f.field_key,f.home_id,f.home_instance_id,f.relation_name,f.record_id,f.field_name,
    encode(sha256(convert_to(to_jsonb(f.field_value)::text,'UTF8')),'hex')
   from maintenance_private.closure_review_text_fields(target_review,target_user,target_epoch) f;
  get diagnostics affected=row_count;
  update maintenance_private.closure_text_snapshots set item_count=affected where plan_id=target_plan returning * into prior;
 end if;
 return jsonb_build_object('kind','closure-text-snapshot/v1','planID',prior.plan_id,'reviewRequestID',prior.review_request_id,'epochID',prior.app_epoch_id,'state',prior.state,'itemCount',prior.item_count,'accountErasureConfirmed',false);
end;$$;
revoke all on function maintenance_private.capture_closure_text_snapshot(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.capture_closure_text_snapshot(uuid,uuid,uuid,uuid,uuid) to ouchi_closure_operator;

create function maintenance_private.read_closure_text_snapshot(target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.closure_text_snapshots; changed boolean;
begin
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 select * into prior from maintenance_private.closure_text_snapshots where plan_id=target_plan and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch for share;
 if not found then raise exception 'Snapshot not found'; end if;
 if prior.state='superseded' then changed:=true;
 else
  with live as (
   select f.field_key,f.home_instance_id,encode(sha256(convert_to(to_jsonb(f.field_value)::text,'UTF8')),'hex') as digest
   from maintenance_private.closure_review_text_fields(target_review,target_user,target_epoch) f
  ), captured as (select i.* from maintenance_private.closure_text_snapshot_items i where i.plan_id=target_plan)
  select (select count(*) from captured)<>prior.item_count or exists(select 1 from live l full join captured c on c.field_key=l.field_key
   where l.field_key is null or c.field_key is null or l.home_instance_id<>c.home_instance_id or l.digest<>c.content_digest) into changed;
 end if;
 -- This is an observation, not a durable clearance. A later write must recheck
 -- the exact plan, scope and live tokens in its own atomic mutation boundary.
 return jsonb_build_object('kind','closure-text-snapshot/v1','planID',prior.plan_id,'reviewRequestID',prior.review_request_id,'epochID',prior.app_epoch_id,'state',prior.state,'itemCount',prior.item_count,'needsNewSnapshot',changed,'accountErasureConfirmed',false);
end;$$;
revoke all on function maintenance_private.read_closure_text_snapshot(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.read_closure_text_snapshot(uuid,uuid,uuid,uuid) to ouchi_closure_operator;
commit;
