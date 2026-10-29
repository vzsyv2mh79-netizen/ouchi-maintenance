begin;
-- Read-only service RPCs. Subscription expiry does not remove existing access;
-- live enrollment, current household membership and verified metadata still apply.
-- Never pass internal read metadata directly to clients or mint long-lived URLs.
create function maintenance_private.attachment_read_session_allowed(target_user uuid,verified_session uuid,expected_epoch uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.app_epochs a
 join maintenance_private.account_access access on access.user_id=a.user_id and access.enabled
 join maintenance_private.app_session_epochs binding on binding.user_id=a.user_id and binding.epoch_id=a.epoch_id and binding.session_id=verified_session
 join auth.sessions session on session.id=binding.session_id and session.user_id=a.user_id and (session.not_after is null or session.not_after>now())
 where a.user_id=target_user and a.epoch_id=expected_epoch and a.enabled);
$$;
revoke all on function maintenance_private.attachment_read_session_allowed(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function maintenance_private.attachment_read_session_allowed(uuid,uuid,uuid) to service_role;
create index attachment_stored_keyset on maintenance_private.product_attachments(product_id,id) where state='stored';
create function public.read_maintenance_attachment(target_user uuid,verified_session uuid,expected_epoch uuid,attachment_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not maintenance_private.attachment_read_session_allowed(target_user,verified_session,expected_epoch) then return null; end if;
 select jsonb_build_object('id',f.id,'user',f.user_id,'epoch',f.app_epoch_id,'size',f.size_bytes,'mime',f.mime,'sha256',f.sha256)
 into result
from maintenance_private.product_attachments f
 join maintenance_private.app_epochs uploader on uploader.user_id=f.user_id
 join public.products p on p.id=f.product_id join public.homes h on h.id=p."homeId"
 where f.id=attachment_id and f.state='stored' and f.sha256 ~ '^[0-9a-f]{64}$' and f.sha256=f.expected_sha256
 and uploader.enabled and uploader.epoch_id=f.app_epoch_id
 and not exists(select 1 from maintenance_private.account_access where user_id=f.user_id and not enabled)
 and not exists(select 1 from maintenance_private.account_access where user_id=h.owner_id and not enabled)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=h.owner_id and not enabled)
 and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user));
 return result;
end;$$;
revoke all on function public.read_maintenance_attachment(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_attachment(uuid,uuid,uuid,uuid) to service_role;
create function public.page_maintenance_attachments(target_user uuid,verified_session uuid,expected_epoch uuid,target_product uuid,after_attachment uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare page jsonb; next_id uuid;
begin
 if not maintenance_private.attachment_read_session_allowed(target_user,verified_session,expected_epoch) then return jsonb_build_object('items','[]'::jsonb,'next',null); end if;
 with visible as (
 select f.id,f.size_bytes,f.mime,f.created_at
from maintenance_private.product_attachments f
 join maintenance_private.app_epochs uploader on uploader.user_id=f.user_id
 join public.products p on p.id=f.product_id join public.homes h on h.id=p."homeId"
 where f.product_id=target_product and (after_attachment is null or f.id>after_attachment) and f.state='stored' and f.sha256 ~ '^[0-9a-f]{64}$' and f.sha256=f.expected_sha256
 and uploader.enabled and uploader.epoch_id=f.app_epoch_id
 and not exists(select 1 from maintenance_private.account_access where user_id=f.user_id and not enabled)
 and not exists(select 1 from maintenance_private.account_access where user_id=h.owner_id and not enabled)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=h.owner_id and not enabled)
 and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user))
 order by f.id limit 26
 ), numbered as (select *,row_number() over(order by id) as n from visible)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'size',size_bytes,'mime',mime,'createdAt',created_at) order by id) filter(where n<=25),'[]'::jsonb),
 case when count(*)>25 then (array_agg(id order by id))[25] else null end
 into page,next_id from numbered;
 return jsonb_build_object('items',page,'next',next_id);
end;$$;
revoke all on function public.page_maintenance_attachments(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.page_maintenance_attachments(uuid,uuid,uuid,uuid,uuid) to service_role;
create function public.maintenance_attachment_usage(target_user uuid,verified_session uuid,expected_epoch uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare total_bytes bigint; total_files bigint; reserved_bytes bigint; reserved_files bigint;
begin
 if not maintenance_private.attachment_read_session_allowed(target_user,verified_session,expected_epoch) then return null; end if;
 select coalesce(sum(size_bytes),0),count(*),coalesce(sum(size_bytes) filter(where state='reserved'),0),count(*) filter(where state='reserved')
 into total_bytes,total_files,reserved_bytes,reserved_files
 from maintenance_private.product_attachments where user_id=target_user and state<>'removed';
 return jsonb_build_object('usedBytes',total_bytes,'usedFiles',total_files,'reservedBytes',reserved_bytes,'reservedFiles',reserved_files,'limitBytes',104857600,'limitFiles',100,'fileLimitBytes',5242880);
end;$$;
revoke all on function public.maintenance_attachment_usage(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.maintenance_attachment_usage(uuid,uuid,uuid) to service_role;
commit;
