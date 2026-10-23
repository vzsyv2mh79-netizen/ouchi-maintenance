-- Dormant operator inventory. Pages are fresh observations, not a frozen erasure
-- plan, subject discovery proof, coverage seal or permission to finish deletion.
begin;
create function maintenance_private.closure_review_field_inventory(
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
 return query
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
 ), keyed as (
  select c.*,c.relation_key||':'||c.record_key::text||':'||c.field_key_name as cursor_key
   from candidate_fields c where c.field_value is not null and c.field_value<>''
 ), limited as (
  select c.* from keyed c where after_key is null or c.cursor_key collate "C">after_key collate "C"
   order by c.cursor_key collate "C" limit 51
 )
 select c.home_key,c.relation_key,c.record_key,c.field_key_name,c.cursor_key,left(c.field_value,512),
  encode(sha256(convert_to(to_jsonb(c.field_value)::text,'UTF8')),'hex'),char_length(c.field_value)>512
 from limited c order by c.cursor_key collate "C";
end;$$;
revoke all on function maintenance_private.closure_review_field_inventory(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_field_inventory(uuid,uuid,uuid,text) to ouchi_closure_operator;
commit;
