-- Dormant review evidence only. A seal is an immutable classification record,
-- NEVER a deletion lease, physical absence proof or authority to mutate records.
begin;
create table maintenance_private.closure_coverage_plans(
 plan_id uuid primary key,review_request_id uuid not null references maintenance_private.account_closure_reviews(review_request_id) on delete restrict,
 user_id uuid not null,app_epoch_id uuid not null,operator_principal name not null,replaces_plan_id uuid,
 state text not null check(state in('open','sealed','superseded')),item_count integer not null default 0 check(item_count between 0 and 10000),
 captured_at timestamptz not null default clock_timestamp(),seal_event_id uuid unique,evidence_digest text,bindings jsonb,sealed_at timestamptz,
 check((seal_event_id is null and evidence_digest is null and bindings is null and sealed_at is null and state<>'sealed')
  or(seal_event_id is not null and evidence_digest is not null and evidence_digest ~ '^[0-9a-f]{64}$' and bindings is not null and jsonb_typeof(bindings)='array' and sealed_at is not null and state in('sealed','superseded')))
);
create unique index closure_coverage_one_current on maintenance_private.closure_coverage_plans(review_request_id) where state<>'superseded';
create table maintenance_private.closure_coverage_items(
 plan_id uuid not null references maintenance_private.closure_coverage_plans(plan_id) on delete cascade,
 kind text not null check(kind in('scope','scope_gap','text','personal_file','household_file')),item_key text not null,
 home_id uuid,home_instance_id uuid,record_id uuid not null,relation_name text,field_name text,content_digest text not null check(content_digest ~ '^[0-9a-f]{64}$'),
 primary key(plan_id,item_key)
);
create table maintenance_private.closure_coverage_text_decisions(
 event_id uuid primary key,event_sequence bigint generated always as identity unique,
 plan_id uuid not null,item_key text not null,operator_principal name not null,action text not null check(action in('retain_reviewed','needs_review')),
 evidence_digest text not null check(evidence_digest ~ '^[0-9a-f]{64}$'),recorded_at timestamptz not null default clock_timestamp(),
 foreign key(plan_id,item_key) references maintenance_private.closure_coverage_items(plan_id,item_key) on delete cascade
);
create index closure_coverage_text_latest on maintenance_private.closure_coverage_text_decisions(plan_id,item_key,event_sequence desc);
alter table maintenance_private.closure_coverage_plans enable row level security;
alter table maintenance_private.closure_coverage_items enable row level security;
alter table maintenance_private.closure_coverage_text_decisions enable row level security;
revoke all on maintenance_private.closure_coverage_plans,maintenance_private.closure_coverage_items,maintenance_private.closure_coverage_text_decisions from public,anon,authenticated,service_role,ouchi_closure_operator;
grant select on maintenance_private.closure_coverage_plans,maintenance_private.closure_coverage_items,maintenance_private.closure_coverage_text_decisions to service_role;

create function maintenance_private.closure_coverage_homes(target_review uuid,target_user uuid,target_epoch uuid)
returns table(home_id uuid) language sql stable security invoker set search_path='' as $$
 select h.id from public.homes h where h.owner_id=target_user
 union select m."homeId" from public.home_members m where m.user_id=target_user
 union select e.home_id from maintenance_private.closure_legacy_home_events e where e.review_request_id=target_review and e.user_id=target_user and e.app_epoch_id=target_epoch
  and maintenance_private.closure_legacy_home_context_is_current(target_review,target_user,target_epoch,e.home_id);
$$;
create function maintenance_private.closure_coverage_text(target_review uuid,target_user uuid,target_epoch uuid)
returns table(item_key text,home_id uuid,home_instance_id uuid,record_id uuid,relation_name text,field_name text,field_value text)
language sql stable security invoker set search_path='' as $$
 select 'text:'||f.field_key,f.home_id,f.home_instance_id,f.record_id,f.relation_name,f.field_name,f.field_value from maintenance_private.closure_review_text_fields(target_review,target_user,target_epoch) f
 union all
 select 'text:home_members:'||m."homeId"::text||':'||m.user_id::text||':nickname',m."homeId",i.instance_id,m.user_id,'home_members','nickname',m.nickname
 from public.home_members m join maintenance_private.closure_home_instances i on i.home_id=m."homeId"
 where m."homeId" in(select home_id from maintenance_private.closure_coverage_homes(target_review,target_user,target_epoch))
 union all
 select 'text:products:'||p.id::text||':categoryId',p."homeId",i.instance_id,p.id,'products','categoryId',p."categoryId"
 from public.products p join maintenance_private.closure_home_instances i on i.home_id=p."homeId"
 where p."homeId" in(select home_id from maintenance_private.closure_coverage_homes(target_review,target_user,target_epoch)) and p."categoryId"<>'';
$$;
create function maintenance_private.closure_coverage_live(target_review uuid,target_user uuid,target_epoch uuid)
returns table(kind text,item_key text,home_id uuid,home_instance_id uuid,record_id uuid,relation_name text,field_name text,content_digest text,file_state text,write_state text,removal_pending boolean,sha256 text,size_bytes bigint)
language sql stable security invoker set search_path='' as $$
 select 'scope','scope:'||h.id::text,h.id,i.instance_id,h.id,null,null,
 encode(sha256(convert_to(jsonb_build_object('home',to_jsonb(h),'instance',i.instance_id,
  'members',(select coalesce(jsonb_agg(to_jsonb(m) order by m.user_id),'[]'::jsonb) from public.home_members m where m."homeId"=h.id),
  'invites',(select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]'::jsonb) from public.home_invites v where v."homeId"=h.id))::text,'UTF8')),'hex'),null::text,null::text,null::boolean,null::text,null::bigint
 from public.homes h join maintenance_private.closure_home_instances i on i.home_id=h.id
 where h.id in(select home_id from maintenance_private.closure_coverage_homes(target_review,target_user,target_epoch))
 union all
 -- A residual file link is not permission to assume all former-household text
 -- was investigated. Require an explicit current legacy context first.
 select 'scope_gap','scope_gap:'||g.home_id::text,g.home_id,g.home_instance_id,g.home_id,null,null,
 encode(sha256(convert_to(jsonb_build_array('unconfirmed_file_household',g.home_id,g.home_instance_id)::text,'UTF8')),'hex'),null::text,null::text,null::boolean,null::text,null::bigint
 from (
  select f.home_id,f.home_instance_id from maintenance_private.closure_review_files(target_review,target_user,target_epoch) f
  union select f.home_id,f.home_instance_id from maintenance_private.closure_review_household_files(target_review,target_user,target_epoch) f
 ) g where g.home_id is not null and g.home_id not in(select home_id from maintenance_private.closure_coverage_homes(target_review,target_user,target_epoch))
 union all
 select 'text',t.item_key,t.home_id,t.home_instance_id,t.record_id,t.relation_name,t.field_name,encode(sha256(convert_to(to_jsonb(t.field_value)::text,'UTF8')),'hex'),null::text,null::text,null::boolean,null::text,null::bigint
 from maintenance_private.closure_coverage_text(target_review,target_user,target_epoch) t
 union all
 select 'personal_file','personal_file:'||f.attachment_id::text,f.home_id,f.home_instance_id,f.attachment_id,null,null,f.metadata_digest,f.file_state,f.write_state,f.removal_pending,f.descriptor->>'sha256',f.size_bytes
 from maintenance_private.closure_review_files(target_review,target_user,target_epoch) f
 union all
 select 'household_file','household_file:'||f.attachment_id::text,f.home_id,f.home_instance_id,f.attachment_id,null,null,f.metadata_digest,f.file_state,f.write_state,f.removal_pending,f.descriptor->>'sha256',f.size_bytes
 from maintenance_private.closure_review_household_files(target_review,target_user,target_epoch) f;
$$;
revoke all on function maintenance_private.closure_coverage_homes(uuid,uuid,uuid),maintenance_private.closure_coverage_text(uuid,uuid,uuid),maintenance_private.closure_coverage_live(uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;

-- One SQL snapshot compares the entire set and the latest per-item decisions.
-- It does not lock every possible writer or grant later mutation authority.
create function maintenance_private.observe_closure_coverage(target_plan uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 with plan as (select * from maintenance_private.closure_coverage_plans where plan_id=target_plan),
 live as materialized(select l.* from plan p cross join lateral maintenance_private.closure_coverage_live(p.review_request_id,p.user_id,p.app_epoch_id) l),
 captured as materialized(select * from maintenance_private.closure_coverage_items where plan_id=target_plan),
 matched as (
  select c.*,l.file_state,l.write_state,l.removal_pending,l.sha256,l.size_bytes,
   coalesce(t.event_id,d.decision_id,hd.decision_id) decision_id,
   case when c.kind='scope' then true
    when c.kind='text' then t.action='retain_reviewed' and t.operator_principal=p.operator_principal
    when c.kind='personal_file' then d.action in('erase_personal_file','retain_family_copy') and d.operator_principal=p.operator_principal
     and f.metadata_digest=c.content_digest and f.sha256=l.sha256 and f.size_bytes=l.size_bytes
     and l.file_state='stored' and l.write_state='settled' and not l.removal_pending
     and (d.action<>'retain_family_copy' or exists(select 1 from public.homes h where h.id=c.home_id and h.owner_id is not null and h.owner_id<>p.user_id) or exists(select 1 from public.home_members m where m."homeId"=c.home_id and m.user_id<>p.user_id))
    when c.kind='household_file' then hd.action in('erase_personal_file','retain_household_file') and hd.operator_principal=p.operator_principal
     and hf.metadata_digest=c.content_digest and hf.sha256=l.sha256 and hf.size_bytes=l.size_bytes
     and l.file_state='active' and l.write_state='settled' and not l.removal_pending
     and (hd.action<>'retain_household_file' or exists(select 1 from public.homes h where h.id=c.home_id and h.owner_id is not null and h.owner_id<>p.user_id) or exists(select 1 from public.home_members m where m."homeId"=c.home_id and m.user_id<>p.user_id))
    else false end resolved
  from captured c cross join plan p left join live l on l.item_key=c.item_key
  left join lateral(select * from maintenance_private.closure_coverage_text_decisions t where t.plan_id=target_plan and t.item_key=c.item_key order by event_sequence desc limit 1) t on c.kind='text'
  left join lateral(select * from maintenance_private.closure_file_decisions d where d.review_request_id=p.review_request_id and d.user_id=p.user_id and d.app_epoch_id=p.app_epoch_id and d.attachment_id=c.record_id order by decision_sequence desc limit 1) d on c.kind='personal_file'
  left join maintenance_private.closure_file_inspections f on f.inspection_id=d.inspection_id
  left join lateral(select * from maintenance_private.closure_household_file_decisions d where d.review_request_id=p.review_request_id and d.user_id=p.user_id and d.app_epoch_id=p.app_epoch_id and d.attachment_id=c.record_id order by decision_sequence desc limit 1) hd on c.kind='household_file'
  left join maintenance_private.closure_household_file_inspections hf on hf.inspection_id=hd.inspection_id
 ), differences as (
  select 1 from live l full join captured c on c.item_key=l.item_key
  where l.item_key is null or c.item_key is null or row(l.kind,l.home_id,l.home_instance_id,l.record_id,l.relation_name,l.field_name,l.content_digest)
   is distinct from row(c.kind,c.home_id,c.home_instance_id,c.record_id,c.relation_name,c.field_name,c.content_digest)
 )
 select jsonb_build_object('current',not exists(select 1 from differences) and (select count(*) from captured)=(select item_count from plan),
  'unresolvedCount',(select count(*) from matched where resolved is not true),
  'bindings',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'key',item_key,'digest',content_digest,'decisionID',decision_id) order by item_key collate "C") from matched),'[]'::jsonb));
$$;
revoke all on function maintenance_private.observe_closure_coverage(uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.require_closure_coverage_plan(target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid)
returns maintenance_private.closure_coverage_plans language plpgsql security definer set search_path='' as $$
declare p maintenance_private.closure_coverage_plans;
begin
 perform 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized operator connection required';end if;
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 select * into p from maintenance_private.closure_coverage_plans where plan_id=target_plan and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and operator_principal=session_user for update;
 if not found then raise exception 'Own matching coverage plan required';end if;
 return p;
end;$$;
revoke all on function maintenance_private.require_closure_coverage_plan(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.capture_closure_coverage(target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,replaces_plan uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare p maintenance_private.closure_coverage_plans;current_plan uuid;affected integer;
begin
 perform 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized operator connection required';end if;
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 if target_plan is null or target_plan='00000000-0000-0000-0000-000000000000'::uuid or target_plan=replaces_plan or replaces_plan='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Explicit coverage plan identity required';end if;
 select * into p from maintenance_private.closure_coverage_plans where plan_id=target_plan;
 if found then
  if row(p.review_request_id,p.user_id,p.app_epoch_id,p.operator_principal,p.replaces_plan_id) is distinct from row(target_review,target_user,target_epoch,session_user,replaces_plan) then raise exception 'Coverage capture conflict';end if;
  return p.plan_id;
 end if;
 select plan_id into current_plan from maintenance_private.closure_coverage_plans where review_request_id=target_review and state<>'superseded' for update;
 if current_plan is distinct from replaces_plan then raise exception 'Current coverage must be explicitly replaced';end if;
 if current_plan is not null and not exists(select 1 from maintenance_private.closure_coverage_plans where plan_id=current_plan and operator_principal=session_user) then raise exception 'Own replacement coverage required';end if;
 if current_plan is not null then update maintenance_private.closure_coverage_plans set state='superseded' where plan_id=current_plan;end if;
 insert into maintenance_private.closure_coverage_plans(plan_id,review_request_id,user_id,app_epoch_id,operator_principal,replaces_plan_id,state) values(target_plan,target_review,target_user,target_epoch,session_user,replaces_plan,'open');
 insert into maintenance_private.closure_coverage_items(plan_id,kind,item_key,home_id,home_instance_id,record_id,relation_name,field_name,content_digest)
 select target_plan,l.kind,l.item_key,l.home_id,l.home_instance_id,l.record_id,l.relation_name,l.field_name,l.content_digest from maintenance_private.closure_coverage_live(target_review,target_user,target_epoch) l limit 10001;
 get diagnostics affected=row_count;
 if affected>10000 then raise exception 'Coverage exceeds bounded review limit';end if;
 update maintenance_private.closure_coverage_plans set item_count=affected where plan_id=target_plan;
 return target_plan;
end;$$;

create function maintenance_private.read_closure_coverage(target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p maintenance_private.closure_coverage_plans;o jsonb;is_current boolean;
begin
 p:=maintenance_private.require_closure_coverage_plan(target_plan,target_review,target_user,target_epoch);o:=maintenance_private.observe_closure_coverage(target_plan);
 is_current:=p.state<>'superseded' and (o->>'current')::boolean and (p.state<>'sealed' or (p.bindings=o->'bindings' and (o->>'unresolvedCount')::integer=0));
 return jsonb_build_object('kind','closure-coverage/v1','planID',p.plan_id,'reviewRequestID',p.review_request_id,'epochID',p.app_epoch_id,'state',p.state,'itemCount',p.item_count,
  'current',is_current,'unresolvedCount',(o->>'unresolvedCount')::integer,'sealEventID',p.seal_event_id,'accountErasureConfirmed',false,'mutationAuthorized',false);
end;$$;
create function maintenance_private.page_closure_coverage(target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,after_key text)
returns table(kind text,item_key text,home_id uuid,home_instance_id uuid,record_id uuid,relation_name text,field_name text,content_digest text)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.require_closure_coverage_plan(target_plan,target_review,target_user,target_epoch);
 if after_key is not null and (octet_length(after_key)>240 or after_key='' or after_key ~ '[[:cntrl:]]') then raise exception 'Bounded coverage cursor required';end if;
 return query select i.kind,i.item_key,i.home_id,i.home_instance_id,i.record_id,i.relation_name,i.field_name,i.content_digest from maintenance_private.closure_coverage_items i
 where i.plan_id=target_plan and (after_key is null or i.item_key collate "C">after_key collate "C") order by i.item_key collate "C" limit 51;
end;$$;

create function maintenance_private.read_closure_coverage_text(target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,target_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p maintenance_private.closure_coverage_plans;c maintenance_private.closure_coverage_items;t record;new_digest text;
begin
 p:=maintenance_private.require_closure_coverage_plan(target_plan,target_review,target_user,target_epoch);
 if p.state<>'open' then raise exception 'Open coverage required';end if;
 select * into c from maintenance_private.closure_coverage_items where plan_id=target_plan and item_key=target_key and kind='text';
 if not found then raise exception 'Captured text item required';end if;
 perform 1 from public.homes where id=c.home_id for update;
 if c.relation_name='home_members' then perform 1 from public.home_members where "homeId"=c.home_id and user_id=c.record_id for update;
 elsif c.relation_name='products' then perform 1 from public.products where id=c.record_id for update;
 elsif c.relation_name='maintenance_tasks' then perform 1 from public.maintenance_tasks where id=c.record_id for update;
 elsif c.relation_name='maintenance_history' then perform 1 from public.maintenance_history where id=c.record_id for update;end if;
 select * into t from maintenance_private.closure_coverage_text(target_review,target_user,target_epoch) where item_key=target_key;
 if not found or t.home_instance_id is distinct from c.home_instance_id then raise exception 'Captured text scope changed';end if;
 if octet_length(t.field_value)>65536 then raise exception 'Text requires separate bounded review';end if;
 new_digest:=encode(sha256(convert_to(to_jsonb(t.field_value)::text,'UTF8')),'hex');
 if new_digest is distinct from c.content_digest then raise exception 'Captured text changed';end if;
 return jsonb_build_object('value',t.field_value,'digest',new_digest);
end;$$;
create function maintenance_private.record_closure_coverage_text_decision(target_event uuid,target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,target_key text,target_action text,target_evidence text)
returns uuid language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.closure_coverage_text_decisions;
begin
 perform maintenance_private.read_closure_coverage_text(target_plan,target_review,target_user,target_epoch,target_key);
 if target_event is null or target_event='00000000-0000-0000-0000-000000000000'::uuid or target_action is null or target_action not in('retain_reviewed','needs_review') or target_evidence is null or target_evidence !~ '^[0-9a-f]{64}$' then raise exception 'Explicit text review decision required';end if;
 select * into prior from maintenance_private.closure_coverage_text_decisions where event_id=target_event;
 if found then
  if row(prior.plan_id,prior.item_key,prior.operator_principal,prior.action,prior.evidence_digest) is distinct from row(target_plan,target_key,session_user,target_action,target_evidence) then raise exception 'Text review event conflict';end if;
  return prior.event_id;
 end if;
 insert into maintenance_private.closure_coverage_text_decisions(event_id,plan_id,item_key,operator_principal,action,evidence_digest) values(target_event,target_plan,target_key,session_user,target_action,target_evidence);
 return target_event;
end;$$;
create function maintenance_private.seal_closure_coverage(target_event uuid,target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,target_evidence text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p maintenance_private.closure_coverage_plans;o jsonb;
begin
 p:=maintenance_private.require_closure_coverage_plan(target_plan,target_review,target_user,target_epoch);
 if target_event is null or target_event='00000000-0000-0000-0000-000000000000'::uuid or target_evidence is null or target_evidence !~ '^[0-9a-f]{64}$' then raise exception 'Explicit coverage seal evidence required';end if;
 if p.seal_event_id is not null then
  if p.seal_event_id<>target_event or p.evidence_digest<>target_evidence then raise exception 'Coverage seal event conflict';end if;
  return p.seal_event_id;
 end if;
 if p.state<>'open' then raise exception 'Open coverage required';end if;
 o:=maintenance_private.observe_closure_coverage(target_plan);
 if (o->>'current')::boolean is not true or (o->>'unresolvedCount')::integer<>0 then raise exception 'Complete current explicit review decisions required';end if;
 update maintenance_private.closure_coverage_plans set state='sealed',seal_event_id=target_event,evidence_digest=target_evidence,bindings=o->'bindings',sealed_at=clock_timestamp() where plan_id=target_plan;
 return target_event;
end;$$;
revoke all on function maintenance_private.capture_closure_coverage(uuid,uuid,uuid,uuid,uuid),maintenance_private.read_closure_coverage(uuid,uuid,uuid,uuid),maintenance_private.page_closure_coverage(uuid,uuid,uuid,uuid,text),maintenance_private.read_closure_coverage_text(uuid,uuid,uuid,uuid,text),maintenance_private.record_closure_coverage_text_decision(uuid,uuid,uuid,uuid,uuid,text,text,text),maintenance_private.seal_closure_coverage(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.capture_closure_coverage(uuid,uuid,uuid,uuid,uuid),maintenance_private.read_closure_coverage(uuid,uuid,uuid,uuid),maintenance_private.page_closure_coverage(uuid,uuid,uuid,uuid,text),maintenance_private.read_closure_coverage_text(uuid,uuid,uuid,uuid,text),maintenance_private.record_closure_coverage_text_decision(uuid,uuid,uuid,uuid,uuid,text,text,text),maintenance_private.seal_closure_coverage(uuid,uuid,uuid,uuid,uuid,text) to ouchi_closure_operator;
-- Explicit, compare-and-swap redaction for every captured text kind,
-- including composite household member names. Receipts contain hashes only.
create table maintenance_private.closure_coverage_redactions(
 event_id uuid primary key,plan_id uuid not null,item_key text not null,operator_principal name not null,
 request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),recorded_at timestamptz not null default clock_timestamp(),
 foreign key(plan_id,item_key) references maintenance_private.closure_coverage_items(plan_id,item_key) on delete cascade
);
alter table maintenance_private.closure_coverage_redactions enable row level security;
revoke all on maintenance_private.closure_coverage_redactions from public,anon,authenticated,service_role,ouchi_closure_operator;
create function maintenance_private.redact_closure_coverage_text(target_event uuid,target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,target_key text,expected_digest text,replacement_text text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p maintenance_private.closure_coverage_plans;c maintenance_private.closure_coverage_items;prior maintenance_private.closure_coverage_redactions;request_hash text;snapshot jsonb;affected integer;
begin
 p:=maintenance_private.require_closure_coverage_plan(target_plan,target_review,target_user,target_epoch);
 if target_event is null or target_event='00000000-0000-0000-0000-000000000000'::uuid or target_key is null or expected_digest is null or expected_digest !~ '^[0-9a-f]{64}$' or octet_length(replacement_text)>65536 then raise exception 'Explicit scoped text redaction required';end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(target_plan,target_review,target_user,target_epoch,target_key,expected_digest,replacement_text)::text,'UTF8')),'hex');
 select * into prior from maintenance_private.closure_coverage_redactions where event_id=target_event;
 if found then
  if prior.request_digest<>request_hash or prior.operator_principal<>session_user then raise exception 'Coverage redaction conflict';end if;
  return prior.event_id;
 end if;
 snapshot:=maintenance_private.read_closure_coverage_text(target_plan,target_review,target_user,target_epoch,target_key);
 if snapshot->>'digest' is distinct from expected_digest then raise exception 'Reviewed text changed';end if;
 if snapshot->'value' is not distinct from coalesce(to_jsonb(replacement_text),'null'::jsonb) then raise exception 'Replacement must change reviewed text';end if;
 select * into c from maintenance_private.closure_coverage_items where plan_id=target_plan and item_key=target_key and kind='text';
 if c.relation_name='home_members' and c.field_name='nickname' then
  update public.home_members set nickname=replacement_text where "homeId"=c.home_id and user_id=c.record_id;
 elsif (c.relation_name='homes' and c.field_name='name') or(c.relation_name='products' and c.field_name in('name','maker','modelNumber','memo','categoryId'))
  or(c.relation_name='maintenance_tasks' and c.field_name in('name','sourceUrl','sourceNote','sourceFrequency')) or(c.relation_name='maintenance_history' and c.field_name='note') then
  execute format('update public.%I set %I=$1 where id=$2',c.relation_name,c.field_name) using replacement_text,c.record_id;
 else raise exception 'Captured allowed text required';end if;
 get diagnostics affected=row_count;if affected<>1 then raise exception 'Captured text row changed';end if;
 insert into maintenance_private.closure_coverage_redactions(event_id,plan_id,item_key,operator_principal,request_digest) values(target_event,target_plan,target_key,session_user,request_hash);
 return target_event;
end;$$;
revoke all on function maintenance_private.redact_closure_coverage_text(uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.redact_closure_coverage_text(uuid,uuid,uuid,uuid,uuid,text,text,text) to ouchi_closure_operator;

create or replace function public.maintenance_deletion_completion_is_confirmed(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.account_deletion_requests r
 join maintenance_private.deletion_retention_checks c on c.request_id=r.id
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch
 and r.state='complete' and r.completion_lease=target_lease and r.receipt_expires_at>statement_timestamp()
 and r.identity_erased and r.records_erased and r.inventory_captured and r.receipt_sessions_captured
 and c.checked_at<=r.updated_at and c.confirmed_until>r.updated_at
 and r.receipt_expires_at=r.updated_at+make_interval(secs=>c.receipt_lifetime_seconds))
 and exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 and not exists(select 1 from maintenance_private.restore_transfer_jobs where user_id=target_user)
 and not exists(select 1 from maintenance_private.attest_registration_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_file_inspections where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_file_decisions where user_id=target_user)
 and not exists(select 1 from maintenance_private.attachment_capacity_claims where split_part(object_path,'/',1)=target_user::text)
 and not exists(select 1 from maintenance_private.household_copy_intents where user_id=target_user or source_uploader_id=target_user or source_captured_owner_id=target_user)
 and not exists(select 1 from maintenance_private.closure_household_file_inspections where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_household_file_decisions where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_coverage_plans where user_id=target_user)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
create or replace function public.complete_maintenance_account_deletion(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare receipt_seconds integer;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if exists(select 1 from maintenance_private.closure_coverage_plans where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_household_file_inspections where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_household_file_decisions where user_id=target_user)
 or exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_file_inspections where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_file_decisions where user_id=target_user)
 or exists(select 1 from maintenance_private.attachment_capacity_claims where split_part(object_path,'/',1)=target_user::text)
 or exists(select 1 from maintenance_private.household_copy_intents where user_id=target_user or source_uploader_id=target_user or source_captured_owner_id=target_user) then return false; end if;
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 perform 1 from maintenance_private.enrollment_policy where id=1 and require_explicit for share;
 if not found then return false; end if;
 -- Idempotent acknowledgement never extends expiry or changes timestamps.
 if public.maintenance_deletion_completion_is_confirmed(target_request,target_user,target_epoch,target_lease) then return true; end if;
 if not public.maintenance_deletion_identity_is_erased(target_request,target_user,target_epoch,target_lease)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request)
 or not exists(select 1 from maintenance_private.deletion_receipt_sessions where request_id=target_request) then return false; end if;
 select c.receipt_lifetime_seconds into receipt_seconds from maintenance_private.deletion_retention_checks c
 where c.request_id=target_request and c.checked_at<=statement_timestamp() and c.confirmed_until>statement_timestamp() for share;
 if not found then return false; end if;
 update maintenance_private.account_deletion_requests set state='complete',completion_lease=target_lease,
 lease_token=null,lease_until=null,updated_at=statement_timestamp(),receipt_expires_at=statement_timestamp()+make_interval(secs=>receipt_seconds)
 where id=target_request;
 return public.maintenance_deletion_completion_is_confirmed(target_request,target_user,target_epoch,target_lease);
end;$$;
commit;
