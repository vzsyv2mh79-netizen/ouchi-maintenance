-- PREPARATORY copy-only namespace, not an activated file-capable generation.
-- Fixed planned generation tuple; root cannot claim/cancel/advance this partial
-- route. No canonical gate, original, deadline or removal rule is weakened.
create table maintenance_private.generation_file_preparations(
 generation_id uuid primary key,root_request uuid not null unique references private.kb_shared_deletion_journal(request_id),
 scope jsonb not null,native_lease uuid not null,review_request uuid not null,
 operator_principal name not null,created_pid integer not null,created_xid bigint not null);
create table maintenance_private.generation_file_copy_bindings(
 intent_id uuid primary key references maintenance_private.household_copy_intents(intent_id) deferrable initially deferred,
 generation_id uuid not null references maintenance_private.generation_file_preparations(generation_id),
 input jsonb not null,created_pid integer not null,created_xid bigint not null);
create table maintenance_private.generation_file_copy_contexts(
 backend_pid integer not null,transaction_id bigint not null,intent_id uuid not null references maintenance_private.generation_file_copy_bindings(intent_id),
 primary key(backend_pid,transaction_id));
create function maintenance_private.refuse_generation_file_change() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Immutable generation file preparation';end$$;
do $$declare t text;begin foreach t in array array['generation_file_preparations','generation_file_copy_bindings','generation_file_copy_contexts'] loop
 execute format('alter table maintenance_private.%I enable row level security',t);
 execute format('revoke all on maintenance_private.%I from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_generation_file_backend',t);
 if t<>'generation_file_copy_contexts' then execute format('create trigger immutable_generation_file before update or delete on maintenance_private.%I for each row execute function maintenance_private.refuse_generation_file_change()',t);execute format('alter table maintenance_private.%I enable always trigger immutable_generation_file',t);end if;
end loop;end$$;
create function maintenance_private.lock_generation_file_root(gid uuid,s jsonb,n uuid,review uuid,factual boolean) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare j private.kb_shared_deletion_journal;g maintenance_private.generation_file_preparations;begin
 if maintenance_private.valid_household_scope(s) is distinct from true or session_user::text<>'ouchi_generation_file_backend' or current_setting('role')<>'none' or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and(x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp()) and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid)) then return false;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=(s->>'requestID')::uuid for update;
 if j.request_id is null or j.scope is distinct from s-'leaseToken' or j.user_id::text is distinct from s->>'userID' or j.receipts<>'{}' or j.lease_token is not null or j.lease_until is not null or j.status<>'requested' or n is null or n=(s->>'leaseToken')::uuid then return false;end if;
 select * into g from maintenance_private.generation_file_preparations where generation_id=gid or root_request=j.request_id;
 if found and(g.generation_id is distinct from gid or g.scope is distinct from s or g.native_lease is distinct from n or g.review_request is distinct from review or g.operator_principal is distinct from session_user::name) then return false;end if;
 if not factual then
  perform maintenance_private.require_closure_snapshot_review(review,j.user_id,(select(a->>'scopeID')::uuid from jsonb_array_elements(s->'apps')a where a->>'app'='ouchi-maintenance'));
 end if;return true;
end$$;
create function maintenance_private.generation_file_source_context_matches(decision uuid,review uuid,actor uuid,epoch uuid,file_id uuid) returns boolean
language sql stable security definer set search_path='' as $$select session_user::text='ouchi_generation_file_backend' and current_setting('role')='none' and exists(
 select 1 from maintenance_private.generation_file_copy_contexts c join maintenance_private.generation_file_copy_bindings b using(intent_id) join maintenance_private.generation_file_preparations g using(generation_id) join private.kb_shared_deletion_journal j on j.request_id=g.root_request
 where c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current() and g.operator_principal=session_user and j.status='requested' and j.scope=g.scope-'leaseToken' and j.user_id=actor and j.receipts='{}' and j.lease_token is null and j.lease_until is null
 and b.input->>'decisionID'=decision::text and b.input->>'reviewRequestID'=review::text and b.input->>'userID'=actor::text and b.input->>'epochID'=epoch::text and b.input->>'fileID'=file_id::text)$$;
create function maintenance_private.pre_generation_file_copy_source(target_decision uuid,target_review uuid,target_user uuid,target_epoch uuid,target_file uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d maintenance_private.closure_file_decisions; inspected maintenance_private.closure_file_inspections; f maintenance_private.product_attachments; current_decision jsonb; descriptor jsonb; participant uuid; initial_uploader uuid; initial_owner uuid;
begin
 if to_regclass('maintenance_private.household_write_routes') is not null then raise exception 'Shared retirement contract upgrade required';end if;
 select user_id,captured_owner_id into initial_uploader,initial_owner from maintenance_private.product_attachments where id=target_file;
 if initial_uploader is null or initial_owner is null then raise exception 'Current copy source required';end if;
 -- Capacity preparation takes its global budget lock before these sorted actor
 -- locks. Execution never requests that global lock while holding actors.
 for participant in select distinct p from unnest(array[target_user,initial_uploader,initial_owner]) p order by p loop perform pg_advisory_xact_lock(hashtext(participant::text));end loop;
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 select * into d from maintenance_private.closure_file_decisions where decision_id=target_decision and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and attachment_id=target_file and operator_principal=session_user;
 if not found or d.action<>'retain_family_copy' then raise exception 'Own retention decision required';end if;
 select * into inspected from maintenance_private.closure_file_inspections where inspection_id=d.inspection_id and operator_principal=session_user;
 if not found then raise exception 'Own inspected source required';end if;
 current_decision:=maintenance_private.read_closure_file_decision(target_review,target_user,target_epoch,target_file,inspected.metadata_digest);
 if current_decision->>'decisionID' is distinct from target_decision::text or current_decision->>'action'<>'retain_family_copy' or not (current_decision->>'current')::boolean then raise exception 'Latest current retention decision required';end if;
 descriptor:=maintenance_private.read_closure_review_file(target_review,target_user,target_epoch,target_file,inspected.metadata_digest)->'file';
 select * into f from maintenance_private.product_attachments where id=target_file for update;
 if f.user_id is distinct from initial_uploader or f.captured_owner_id is distinct from initial_owner
 or descriptor->>'homeID' is null or descriptor->>'homeInstanceID' is null
 or not maintenance_private.attachment_write_is_quiet(target_file)
 or not exists(select 1 from maintenance_private.attachment_write_attempts w where w.attachment_id=f.id and w.uploader_id=f.user_id and w.owner_id=f.captured_owner_id and w.app_epoch_id=f.app_epoch_id and w.state='settled')
 then raise exception 'Settled matching copy source required';end if;
 for participant in select distinct p from unnest(array[target_user,f.user_id,f.captured_owner_id]) p order by p loop
  perform 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id where e.user_id=participant and e.enabled and a.enabled for share of e,a;
  if not found or exists(select 1 from maintenance_private.account_deletion_requests where user_id=participant and state<>'complete') then raise exception 'Copy participant retirement must be reconciled';end if;
 end loop;
 return jsonb_build_object('file',descriptor,'metadataDigest',inspected.metadata_digest,'inspectionID',inspected.inspection_id,'capturedOwnerID',f.captured_owner_id);
end;$$;
create function maintenance_private.bound_generation_file_copy_source(target_decision uuid,target_review uuid,target_user uuid,target_epoch uuid,target_file uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d maintenance_private.closure_file_decisions; inspected maintenance_private.closure_file_inspections; f maintenance_private.product_attachments; current_decision jsonb; descriptor jsonb; participant uuid; initial_uploader uuid; initial_owner uuid;
begin
 if not maintenance_private.generation_file_source_context_matches(target_decision,target_review,target_user,target_epoch,target_file) then raise exception 'Exact generation file preparation context required';end if;
 select user_id,captured_owner_id into initial_uploader,initial_owner from maintenance_private.product_attachments where id=target_file;
 if initial_uploader is null or initial_owner is null then raise exception 'Current copy source required';end if;
 -- Capacity preparation takes its global budget lock before these sorted actor
 -- locks. Execution never requests that global lock while holding actors.
 for participant in select distinct p from unnest(array[target_user,initial_uploader,initial_owner]) p order by p loop perform pg_advisory_xact_lock(hashtext(participant::text));end loop;
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 select * into d from maintenance_private.closure_file_decisions where decision_id=target_decision and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and attachment_id=target_file and operator_principal=session_user;
 if not found or d.action<>'retain_family_copy' then raise exception 'Own retention decision required';end if;
 select * into inspected from maintenance_private.closure_file_inspections where inspection_id=d.inspection_id and operator_principal=session_user;
 if not found then raise exception 'Own inspected source required';end if;
 current_decision:=maintenance_private.read_closure_file_decision(target_review,target_user,target_epoch,target_file,inspected.metadata_digest);
 if current_decision->>'decisionID' is distinct from target_decision::text or current_decision->>'action'<>'retain_family_copy' or not (current_decision->>'current')::boolean then raise exception 'Latest current retention decision required';end if;
 descriptor:=maintenance_private.read_closure_review_file(target_review,target_user,target_epoch,target_file,inspected.metadata_digest)->'file';
 select * into f from maintenance_private.product_attachments where id=target_file for update;
 if f.user_id is distinct from initial_uploader or f.captured_owner_id is distinct from initial_owner
 or descriptor->>'homeID' is null or descriptor->>'homeInstanceID' is null
 or not maintenance_private.attachment_write_is_quiet(target_file)
 or not exists(select 1 from maintenance_private.attachment_write_attempts w where w.attachment_id=f.id and w.uploader_id=f.user_id and w.owner_id=f.captured_owner_id and w.app_epoch_id=f.app_epoch_id and w.state='settled')
 then raise exception 'Settled matching copy source required';end if;
 for participant in select distinct p from unnest(array[target_user,f.user_id,f.captured_owner_id]) p order by p loop
  perform 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id where e.user_id=participant and e.enabled and a.enabled for share of e,a;
  if not found or exists(select 1 from maintenance_private.account_deletion_requests where user_id=participant and state<>'complete') then raise exception 'Copy participant retirement must be reconciled';end if;
 end loop;
 return jsonb_build_object('file',descriptor,'metadataDigest',inspected.metadata_digest,'inspectionID',inspected.inspection_id,'capturedOwnerID',f.captured_owner_id);
end;$$;
do $$begin
 if(select prosrc from pg_proc where oid='maintenance_private.pre_generation_file_copy_source(uuid,uuid,uuid,uuid,uuid)'::regprocedure) is distinct from(select prosrc from pg_proc where oid='maintenance_private.require_household_copy_source(uuid,uuid,uuid,uuid,uuid)'::regprocedure) then raise exception 'Pinned copy source dependency drift';end if;
end$$;
create or replace function maintenance_private.require_household_copy_source(target_decision uuid,target_review uuid,target_user uuid,target_epoch uuid,target_file uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$begin
 if maintenance_private.generation_file_source_context_matches(target_decision,target_review,target_user,target_epoch,target_file) then return maintenance_private.bound_generation_file_copy_source(target_decision,target_review,target_user,target_epoch,target_file);end if;
 return maintenance_private.pre_generation_file_copy_source(target_decision,target_review,target_user,target_epoch,target_file);
end$$;
create function maintenance_private.generation_file_copy_call(gid uuid,s jsonb,n uuid,input jsonb,action text,extra jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.generation_file_preparations;b maintenance_private.generation_file_copy_bindings;result jsonb;intent uuid:=(input->>'intentID')::uuid;review uuid:=(input->>'reviewRequestID')::uuid;actor uuid:=(input->>'userID')::uuid;epoch uuid:=(input->>'epochID')::uuid;factual boolean:=action in('status','fact');begin
 if jsonb_typeof(input) is distinct from 'object' or action not in('prepare','lock','status','issue','write','fact','confirm') or input->>'userID' is distinct from s->>'userID'
 or not exists(select 1 from jsonb_array_elements(s->'apps')a where a->>'app'='ouchi-maintenance' and a->>'scopeID'=input->>'epochID')
 or not maintenance_private.lock_generation_file_root(gid,s,n,review,factual) then raise exception 'Exact requested generation file root required';end if;
 if action='prepare' then
  if(select count(*) from jsonb_object_keys(input))<>7 or not(input?&array['intentID','decisionID','reviewRequestID','userID','epochID','fileID','destinationID']) or extra<>'[]' then raise exception 'Exact generation copy preparation required';end if;
  select * into g from maintenance_private.generation_file_preparations where generation_id=gid;
  if not found then insert into maintenance_private.generation_file_preparations values(gid,(s->>'requestID')::uuid,s,n,review,session_user,pg_backend_pid(),txid_current());end if;
  select * into b from maintenance_private.generation_file_copy_bindings where intent_id=intent;
  if found and(b.generation_id<>gid or b.input<>input) then raise exception 'Generation copy input conflict';end if;
  if not found then insert into maintenance_private.generation_file_copy_bindings values(intent,gid,input,pg_backend_pid(),txid_current());end if;
 else
  if(select count(*) from jsonb_object_keys(input))<>4 or not(input?&array['intentID','reviewRequestID','userID','epochID']) then raise exception 'Exact generation copy operation required';end if;
  select * into b from maintenance_private.generation_file_copy_bindings where intent_id=intent;
  if not found or b.generation_id<>gid or b.input-array['decisionID','fileID','destinationID']<>input then raise exception 'Bound copy generation required';end if;
 end if;
 insert into maintenance_private.generation_file_copy_contexts values(pg_backend_pid(),txid_current(),intent);
 case action
 when 'prepare' then result:=maintenance_private.prepare_household_copy(intent,(input->>'decisionID')::uuid,review,actor,epoch,(input->>'fileID')::uuid,(input->>'destinationID')::uuid);
 when 'lock' then if extra<>'[]' then raise exception 'Unexpected copy arguments';end if;result:=maintenance_private.lock_household_copy_intent(intent,review,actor,epoch);
 when 'status' then if extra<>'[]' then raise exception 'Unexpected copy arguments';end if;result:=maintenance_private.read_household_copy_status(intent,review,actor,epoch);
 when 'issue' then if jsonb_array_length(extra)<>2 then raise exception 'Exact writer arguments';end if;result:=maintenance_private.issue_household_copy_write(intent,review,actor,epoch,(extra->>0)::uuid,(extra->>1)::uuid);
 when 'write' then if jsonb_array_length(extra)<>2 then raise exception 'Exact writer arguments';end if;result:=maintenance_private.lock_household_copy_write(intent,review,actor,epoch,(extra->>0)::uuid,(extra->>1)::uuid);
 when 'fact' then if jsonb_array_length(extra)<>3 then raise exception 'Exact writer fact';end if;result:=to_jsonb(maintenance_private.record_household_copy_write_fact(intent,review,actor,epoch,(extra->>0)::uuid,(extra->>1)::uuid,extra->>2));
 when 'confirm' then if jsonb_array_length(extra)<>2 then raise exception 'Exact measured bytes';end if;result:=maintenance_private.confirm_household_copy_bytes(intent,review,actor,epoch,extra->>0,(extra->>1)::bigint);
 end case;
 delete from maintenance_private.generation_file_copy_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();return result;
end$$;
create function maintenance_private.generation_file_copy_frame(gid uuid,s jsonb,n uuid,review uuid,factual boolean) returns table(ok boolean,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$begin
 if not maintenance_private.lock_generation_file_root(gid,s,n,review,factual) then return;end if;
 return query select true,pg_backend_pid(),txid_current()::text;
end$$;
create function maintenance_private.guard_generation_file_root_transition() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from maintenance_private.generation_file_preparations where root_request=old.request_id) and(to_jsonb(new) is distinct from to_jsonb(old)) then raise exception 'Generation file preparation is not integrated with root transition/cancellation';end if;return new;
end$$;
create trigger generation_file_root_transition before update on private.kb_shared_deletion_journal for each row execute function maintenance_private.guard_generation_file_root_transition();
alter table private.kb_shared_deletion_journal enable always trigger generation_file_root_transition;
create function maintenance_private.check_generation_file_copy_commit() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from maintenance_private.generation_file_copy_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current()) or not exists(select 1 from maintenance_private.household_copy_intents i where i.intent_id=new.intent_id and i.review_request_id::text=new.input->>'reviewRequestID' and i.user_id::text=new.input->>'userID' and i.app_epoch_id::text=new.input->>'epochID' and i.decision_id::text=new.input->>'decisionID' and i.source_attachment_id::text=new.input->>'fileID' and i.household_attachment_id::text=new.input->>'destinationID') then raise exception 'Exact complete generation file binding required at COMMIT';end if;return null;
end$$;
create constraint trigger generation_file_binding_commit after insert on maintenance_private.generation_file_copy_bindings deferrable initially deferred for each row execute function maintenance_private.check_generation_file_copy_commit();
alter table maintenance_private.generation_file_copy_bindings enable always trigger generation_file_binding_commit;
do $$declare p record;begin for p in select oid::regprocedure f from pg_proc where pronamespace='maintenance_private'::regnamespace and proname in('refuse_generation_file_change','lock_generation_file_root','generation_file_source_context_matches','pre_generation_file_copy_source','bound_generation_file_copy_source','generation_file_copy_call','generation_file_copy_frame','guard_generation_file_root_transition','check_generation_file_copy_commit') loop execute format('revoke all on function %s from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_generation_file_backend',p.f);end loop;end$$;
grant usage on schema private,maintenance_private to ouchi_generation_file_backend;
grant execute on function maintenance_private.generation_file_copy_call(uuid,jsonb,uuid,jsonb,text,jsonb),maintenance_private.generation_file_copy_frame(uuid,jsonb,uuid,uuid,boolean) to ouchi_generation_file_backend;
