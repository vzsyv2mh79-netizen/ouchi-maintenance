-- Private bounded inventory for the reviewed-file prelude. It does not weaken
-- the ordinary worker's pending-copy lease fence or grant any Storage access.
begin;
create function maintenance_private.page_reviewed_cleanup(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid,after_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;more boolean;last_key text;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh cleanup page required';end if;
 perform 1 from maintenance_private.retirement_file_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized cleanup connection required';end if;
 if after_key is not null and after_key !~ '^(personal_file|household_file):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Exact cleanup cursor required';end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request and user_id=target_user and app_epoch_id=target_epoch and state='running' and lease_token=target_lease and lease_until>clock_timestamp() for update;
 if not found then raise exception 'Current cleanup page lease required';end if;
 if not exists(select 1 from maintenance_private.reviewed_retirements where deletion_request_id=target_request and user_id=target_user and app_epoch_id=target_epoch) then
  if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then raise exception 'Ordinary deletion lease required';end if;
  return jsonb_build_object('mode','ordinary','requestID',target_request,'userID',target_user,'epochID',target_epoch,'items','[]'::jsonb,'hasMore',false,'nextKey',null,'accountErasureConfirmed',false);
 end if;
 perform maintenance_private.require_reviewed_finalization_lease(target_request,target_user,target_epoch,target_lease);
 perform 1 from maintenance_private.reviewed_retirement_policy where id=1 and enabled and writer_coverage_verified for share;
 if not found then raise exception 'Reviewed cleanup unavailable';end if;
 if exists(select 1 from maintenance_private.reviewed_retirement_files where request_id=target_request and state='pending') and not exists(select 1 from maintenance_private.reviewed_retirement_policy where id=1 and attachments_enabled) then raise exception 'Attachment cleanup unavailable';end if;
 with page as (
  select kind,attachment_id,state,kind||':'||attachment_id::text key from maintenance_private.reviewed_retirement_files
  where request_id=target_request and action<>'retain_household_file' and (after_key is null or (kind||':'||attachment_id::text) collate "C">after_key collate "C") order by (kind||':'||attachment_id::text) collate "C" limit 51
 ),visible as(select * from page order by key collate "C" limit 50)
 select coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'fileID',attachment_id,'state',state) order by key collate "C") from visible),'[]'::jsonb),(select count(*)>50 from page),(select key from visible order by key collate "C" desc limit 1) into items,more,last_key;
 return jsonb_build_object('mode','reviewed','requestID',target_request,'userID',target_user,'epochID',target_epoch,'items',items,'hasMore',more,'nextKey',case when more then last_key else null end,'accountErasureConfirmed',false);
end;$$;
revoke all on function maintenance_private.page_reviewed_cleanup(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role,ouchi_closure_operator;
grant execute on function maintenance_private.page_reviewed_cleanup(uuid,uuid,uuid,uuid,text) to ouchi_retirement_file_executor;
commit;
