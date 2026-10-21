-- Isolated unused-file-preparation undo only. NO physical deletion or capacity
-- release. Only ZERO writer rows, reserved/staged metadata and genuine absence.
create table maintenance_private.generation_file_preparation_cancellations(
 generation_id uuid primary key references maintenance_private.generation_file_preparations(generation_id),
 before_state jsonb not null,observations jsonb not null,
 backend_pid integer not null,transaction_id bigint not null);
create table maintenance_private.generation_file_cancellation_contexts(
 backend_pid integer not null,transaction_id bigint not null,generation_id uuid not null references maintenance_private.generation_file_preparation_cancellations(generation_id),
 primary key(backend_pid,transaction_id));
do $$declare t text;begin foreach t in array array['generation_file_preparation_cancellations','generation_file_cancellation_contexts'] loop
 execute format('alter table maintenance_private.%I enable row level security',t);
 execute format('revoke all on maintenance_private.%I from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_generation_file_backend,shared_retirement_backend',t);
end loop;end$$;
create trigger immutable_generation_file_cancellation before update or delete on maintenance_private.generation_file_preparation_cancellations for each row execute function maintenance_private.refuse_generation_file_change();
alter table maintenance_private.generation_file_preparation_cancellations enable always trigger immutable_generation_file_cancellation;
-- The binding remains immutable history. Its previous FK is replaced ONLY by
-- an exact cancelled-history exception plus ALWAYS commit/deletion checks.
-- No Auth/legacy-plan/other-app FK or source data is changed here.
do $$declare c record;count_value int:=0;begin
 for c in select * from pg_constraint where contype='f' and conrelid='maintenance_private.generation_file_copy_bindings'::regclass and confrelid='maintenance_private.household_copy_intents'::regclass loop
  if cardinality(c.conkey)<>1 or not c.convalidated or not c.condeferrable or not c.condeferred then raise exception 'File binding FK drift';end if;
  count_value:=count_value+1;execute format('alter table maintenance_private.generation_file_copy_bindings drop constraint %I',c.conname);
 end loop;if count_value<>1 then raise exception 'One exact file-binding FK required';end if;
end$$;
create function maintenance_private.generation_file_cancellation_caller() returns boolean
language sql stable security definer set search_path='' as $$select session_user::text='shared_retirement_backend' and current_setting('role')='none' and exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and(x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp()) and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid))$$;
create function maintenance_private.generation_file_preserved_snapshot(gid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with homes as(select distinct p."homeId" id from maintenance_private.generation_file_copy_bindings b join maintenance_private.product_attachments f on f.id=(b.input->>'fileID')::uuid join public.products p on p.id=f.product_id where b.generation_id=gid),products as(select p.id from public.products p where p."homeId" in(select id from homes))
 select jsonb_build_object('homes',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id),'[]') from public.homes h where h.id in(select id from homes)),
 'members',(select coalesce(jsonb_agg(to_jsonb(m) order by m."homeId",m.user_id),'[]') from public.home_members m where m."homeId" in(select id from homes)),
 'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.products p where p.id in(select id from products)),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.maintenance_tasks t where t."productId" in(select id from products)),
 'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id),'[]') from public.maintenance_history h where h."productId" in(select id from products)),
 'personalFiles',(select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]') from maintenance_private.product_attachments f where f.product_id in(select id from products)),
 'personalWrites',(select coalesce(jsonb_agg(to_jsonb(w) order by w.attachment_id),'[]') from maintenance_private.attachment_write_attempts w join maintenance_private.product_attachments f on f.id=w.attachment_id where f.product_id in(select id from products)),
 'householdFiles',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id),'[]') from maintenance_private.household_attachments h where h.product_id in(select id from products) and not exists(select 1 from maintenance_private.generation_file_copy_bindings b where b.generation_id=gid and b.input->>'destinationID'=h.id::text)));
$$;
create function maintenance_private.generation_unused_file_state(gid uuid,s jsonb,n uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.generation_file_preparations;j private.kb_shared_deletion_journal;b maintenance_private.generation_file_copy_bindings;i maintenance_private.household_copy_intents;d maintenance_private.household_attachments;f maintenance_private.product_attachments;c record;actor uuid;rows_value jsonb:='[]';manifest jsonb;has_row boolean;begin
 if not maintenance_private.generation_file_cancellation_caller() or maintenance_private.valid_household_scope(s) is distinct from true then return null;end if;
 select * into g from maintenance_private.generation_file_preparations where generation_id=gid;
 select * into j from private.kb_shared_deletion_journal where request_id=(s->>'requestID')::uuid for update;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.root_request is distinct from j.request_id or j.user_id::text is distinct from s->>'userID' or j.status is distinct from 'requested' or j.scope is distinct from s-'leaseToken' or j.receipts<>'{}' or j.lease_token is not null or j.lease_until is not null or exists(select 1 from maintenance_private.generation_file_preparation_cancellations where generation_id=gid) then return null;end if;
 if not exists(select 1 from maintenance_private.account_access where user_id=j.user_id and enabled) or not exists(select 1 from maintenance_private.app_epochs where user_id=j.user_id and epoch_id=(select(a->>'scopeID')::uuid from jsonb_array_elements(s->'apps')a where a->>'app'='ouchi-maintenance') and enabled) or exists(select 1 from maintenance_private.account_deletion_requests where user_id=j.user_id) then return null;end if;
 if(select count(*) from maintenance_private.generation_file_copy_bindings where generation_id=gid) not between 1 and 100 then return null;end if;
 for actor in select distinct u from(select j.user_id u union select actor_file.user_id from maintenance_private.generation_file_copy_bindings actor_binding join maintenance_private.product_attachments actor_file on actor_file.id=(actor_binding.input->>'fileID')::uuid where actor_binding.generation_id=gid union select actor_home.owner_id from maintenance_private.generation_file_copy_bindings actor_binding join maintenance_private.product_attachments actor_file on actor_file.id=(actor_binding.input->>'fileID')::uuid join public.products p on p.id=actor_file.product_id join public.homes actor_home on actor_home.id=p."homeId" where actor_binding.generation_id=gid union select actor_member.user_id from maintenance_private.generation_file_copy_bindings actor_binding join maintenance_private.product_attachments actor_file on actor_file.id=(actor_binding.input->>'fileID')::uuid join public.products p on p.id=actor_file.product_id join public.home_members actor_member on actor_member."homeId"=p."homeId" where actor_binding.generation_id=gid)q order by u loop perform pg_advisory_xact_lock(hashtext(actor::text));end loop;
 for b in select * from maintenance_private.generation_file_copy_bindings where generation_id=gid order by intent_id for share loop
  select * into i from maintenance_private.household_copy_intents where intent_id=b.intent_id for update;
  select * into d from maintenance_private.household_attachments where id=(b.input->>'destinationID')::uuid for update;
  select * into f from maintenance_private.product_attachments where id=(b.input->>'fileID')::uuid for update;
  if i.intent_id is null or d.id is null or f.id is null or i.operator_principal is distinct from g.operator_principal or i.user_id is distinct from j.user_id or i.review_request_id is distinct from g.review_request or i.state<>'reserved' or i.copied_at is not null
  or i.intent_id::text is distinct from b.input->>'intentID' or i.decision_id::text is distinct from b.input->>'decisionID' or i.review_request_id::text is distinct from b.input->>'reviewRequestID' or i.user_id::text is distinct from b.input->>'userID' or i.app_epoch_id::text is distinct from b.input->>'epochID' or i.source_attachment_id is distinct from f.id or i.household_attachment_id is distinct from d.id
  or d.id=f.id or not exists(select 1 from public.products current_product join maintenance_private.closure_home_instances current_home on current_home.home_id=current_product."homeId" where current_product.id=f.product_id and current_product."homeId"=d.home_id and current_home.instance_id=d.home_instance_id) or d.state<>'staged' or d.removal_pending or exists(select 1 from maintenance_private.household_copy_writes where intent_id=b.intent_id)
  or exists(select 1 from maintenance_private.generation_file_copy_contexts x join maintenance_private.generation_file_copy_bindings v using(intent_id) where v.generation_id=gid)
  or f.user_id is distinct from i.source_uploader_id or f.captured_owner_id is distinct from i.source_captured_owner_id or f.state<>'stored' or f.removal_pending or not maintenance_private.attachment_write_is_quiet(f.id)
  or f.id::text is distinct from i.source_descriptor->>'attachmentID' or f.user_id::text is distinct from i.source_descriptor->>'uploaderID' or f.app_epoch_id::text is distinct from i.source_descriptor->>'uploaderEpoch' or f.object_path is distinct from i.source_descriptor->>'objectPath' or f.product_id::text is distinct from i.source_descriptor->>'productID' or f.sha256 is distinct from i.source_descriptor->>'sha256' or f.expected_sha256 is distinct from f.sha256 or f.size_bytes::text is distinct from i.source_descriptor->>'sizeBytes' or f.mime is distinct from i.source_descriptor->>'mime'
  or d.home_id::text is distinct from i.source_descriptor->>'homeID' or d.home_instance_id::text is distinct from i.source_descriptor->>'homeInstanceID' or d.product_id is distinct from f.product_id or d.sha256 is distinct from f.sha256 or d.size_bytes is distinct from f.size_bytes or d.mime is distinct from f.mime
  or not exists(select 1 from maintenance_private.attachment_capacity_claims a where a.claim_id=i.capacity_claim_id and a.claim_id=i.intent_id and a.object_path=d.object_path and a.size_bytes=d.size_bytes and a.purpose='household-copy')
  or exists(select 1 from storage.objects o where o.bucket_id='ouchi-product-attachments' and o.name=d.object_path)
  or exists(select 1 from maintenance_private.household_file_removal_receipts where attachment_id=d.id)
  or exists(select 1 from maintenance_private.retired_attachment_ids where attachment_id=d.id) then return null;end if;
  -- Refuse unknown incoming storage even when empty; known children must empty
  -- (the selected exact intent row is the only household-attachment exception).
  for c in select k.*,ns.nspname,cl.relname,aa.attname,pa.attname parent_column from pg_constraint k join pg_class cl on cl.oid=k.conrelid join pg_namespace ns on ns.oid=cl.relnamespace join pg_attribute aa on aa.attrelid=k.conrelid and aa.attnum=k.conkey[1] join pg_attribute pa on pa.attrelid=k.confrelid and pa.attnum=k.confkey[1] where k.contype='f' and k.confrelid in('maintenance_private.household_copy_intents'::regclass,'maintenance_private.household_attachments'::regclass) loop
   if not c.convalidated or c.condeferrable or cardinality(c.conkey)<>1 or cardinality(c.confkey)<>1 or c.parent_column<>(case when c.confrelid='maintenance_private.household_copy_intents'::regclass then 'intent_id' else 'id' end) or c.nspname<>'maintenance_private' or(c.relname,c.attname) not in(('household_copy_writes','intent_id'),('reviewed_retirement_files','copy_intent_id'),('household_copy_intents','household_attachment_id'),('household_attachment_origins','attachment_id'),('reviewed_retirement_files','retained_asset_id'),('household_removal_capacity_moves','attachment_id')) then return null;end if;
   if c.relname='household_copy_intents' then continue;end if;
   execute format('select exists(select 1 from %I.%I where %I=$1)',c.nspname,c.relname,c.attname) into has_row using case when c.confrelid='maintenance_private.household_copy_intents'::regclass then i.intent_id else d.id end;if has_row then return null;end if;
  end loop;
  manifest:=jsonb_build_object('intentID',i.intent_id,'capacityClaimID',i.capacity_claim_id,'source',i.source_descriptor,'destination',jsonb_build_object('id',d.id,'homeID',d.home_id,'homeInstanceID',d.home_instance_id,'productID',d.product_id,'mime',d.mime,'size',d.size_bytes,'sha256',d.sha256,'objectPath',d.object_path));
  rows_value:=rows_value||jsonb_build_array(jsonb_build_object('binding',to_jsonb(b),'intent',to_jsonb(i),'destination',to_jsonb(d),'capacity',(select to_jsonb(a) from maintenance_private.attachment_capacity_claims a where a.claim_id=i.capacity_claim_id),'manifest',manifest));
 end loop;
 return jsonb_build_object('root',to_jsonb(j),'header',to_jsonb(g),'files',rows_value,'preserved',maintenance_private.generation_file_preserved_snapshot(gid));
end$$;
create function maintenance_private.preview_generation_file_cancellation(gid uuid,s jsonb,n uuid) returns table(snapshot jsonb,fingerprint text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare value jsonb;begin value:=maintenance_private.generation_unused_file_state(gid,s,n);if value is null then return;end if;return query select value,encode(sha256(convert_to(value::text,'UTF8')),'hex'),pg_backend_pid(),txid_current()::text;end$$;
create function maintenance_private.generation_file_cancelled_state(gid uuid,s jsonb,n uuid,fresh boolean,root_phase text) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.generation_file_preparations;c maintenance_private.generation_file_preparation_cancellations;j private.kb_shared_deletion_journal;f jsonb;begin
 if not maintenance_private.generation_file_cancellation_caller() then return false;end if;
 select * into g from maintenance_private.generation_file_preparations where generation_id=gid;
 select * into c from maintenance_private.generation_file_preparation_cancellations where generation_id=gid;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request for update;
 if c.generation_id is null or g.scope is distinct from s or g.native_lease is distinct from n or j.scope is distinct from s-'leaseToken' or j.status is distinct from root_phase or j.receipts<>'{}' or j.lease_token is not null or j.lease_until is not null or to_jsonb(g) is distinct from c.before_state->'header'
 or(to_jsonb(j)-'status') is distinct from((c.before_state->'root')-'status')
 or exists(select 1 from maintenance_private.generation_file_cancellation_contexts where generation_id=gid) then return false;end if;
 if fresh and(c.backend_pid<>pg_backend_pid() or c.transaction_id<>txid_current() or c.before_state->'preserved' is distinct from maintenance_private.generation_file_preserved_snapshot(gid)) then return false;end if;
 if(select count(*) from maintenance_private.generation_file_copy_bindings where generation_id=gid)<>jsonb_array_length(c.before_state->'files') then return false;end if;
 for f in select value from jsonb_array_elements(c.before_state->'files') loop
  if not exists(select 1 from maintenance_private.generation_file_copy_bindings b where b.intent_id=(f->'binding'->>'intent_id')::uuid and to_jsonb(b)=f->'binding')
  or exists(select 1 from maintenance_private.household_copy_intents where intent_id=(f->'intent'->>'intent_id')::uuid)
  or exists(select 1 from maintenance_private.household_copy_writes where intent_id=(f->'intent'->>'intent_id')::uuid)
  or exists(select 1 from maintenance_private.household_attachments where id=(f->'destination'->>'id')::uuid)
  or(fresh and exists(select 1 from storage.objects o where o.bucket_id='ouchi-product-attachments' and o.name=f->'destination'->>'object_path'))
  or not exists(select 1 from maintenance_private.retired_attachment_ids where attachment_id=(f->'destination'->>'id')::uuid)
  or not exists(select 1 from maintenance_private.attachment_capacity_claims a where a.claim_id=(f->'capacity'->>'claim_id')::uuid and to_jsonb(a)=f->'capacity') then return false;end if;
 end loop;return true;
end$$;
create function maintenance_private.apply_generation_file_cancellation(gid uuid,s jsonb,n uuid,expected_fingerprint text,observations jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare before_value jsonb;expected_observations jsonb;f jsonb;begin
 before_value:=maintenance_private.generation_unused_file_state(gid,s,n);
 if before_value is null or encode(sha256(convert_to(before_value::text,'UTF8')),'hex') is distinct from expected_fingerprint then raise exception 'Exact unused file preparation required';end if;
 select jsonb_agg(jsonb_build_object('intentID',x->'intent'->>'intent_id','sourceSHA256',x->'manifest'->'source'->>'sha256','sizeBytes',(x->'manifest'->'source'->>'sizeBytes')::bigint,'mime',x->'manifest'->'source'->>'mime','destinationAbsent',true) order by x->'intent'->>'intent_id') into expected_observations from jsonb_array_elements(before_value->'files')x;
 if observations is distinct from expected_observations then raise exception 'Exact measured source/negative destination observations required';end if;
 insert into maintenance_private.generation_file_preparation_cancellations values(gid,before_value,observations,pg_backend_pid(),txid_current());
 insert into maintenance_private.generation_file_cancellation_contexts values(pg_backend_pid(),txid_current(),gid);
 for f in select value from jsonb_array_elements(before_value->'files') loop
  insert into maintenance_private.retired_attachment_ids(attachment_id) values((f->'destination'->>'id')::uuid);
  delete from maintenance_private.household_copy_intents where intent_id=(f->'intent'->>'intent_id')::uuid and to_jsonb(household_copy_intents)=f->'intent';if not found then raise exception 'Exact unused intent required';end if;
  delete from maintenance_private.household_attachments where id=(f->'destination'->>'id')::uuid and to_jsonb(household_attachments)=f->'destination';if not found then raise exception 'Exact staged destination required';end if;
 end loop;
 delete from maintenance_private.generation_file_cancellation_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 if not maintenance_private.generation_file_cancelled_state(gid,s,n,true,'requested') then raise exception 'Exact file preparation undo required';end if;return true;
end$$;
create function maintenance_private.guard_bound_generation_file_delete() returns trigger
language plpgsql security definer set search_path='' as $$declare b maintenance_private.generation_file_copy_bindings;c maintenance_private.generation_file_preparation_cancellations;expected jsonb;begin
 if tg_table_name='household_copy_intents' then select * into b from maintenance_private.generation_file_copy_bindings where intent_id=old.intent_id;
 else select * into b from maintenance_private.generation_file_copy_bindings where input->>'destinationID'=old.id::text;end if;
 if b.intent_id is null then return old;end if;
 select v.* into c from maintenance_private.generation_file_preparation_cancellations v join maintenance_private.generation_file_cancellation_contexts ctx using(generation_id) where v.generation_id=b.generation_id and ctx.backend_pid=pg_backend_pid() and ctx.transaction_id=txid_current() and v.backend_pid=pg_backend_pid() and v.transaction_id=txid_current();
 select value->case when tg_table_name='household_copy_intents' then 'intent' else 'destination' end into expected from jsonb_array_elements(c.before_state->'files') where value->'binding'->>'intent_id'=b.intent_id::text;
 if not maintenance_private.generation_file_cancellation_caller() or expected is distinct from to_jsonb(old) then raise exception 'Exact generation file cancellation delete context required';end if;return old;
end$$;
create trigger bound_generation_file_delete before delete on maintenance_private.household_copy_intents for each row execute function maintenance_private.guard_bound_generation_file_delete();
create trigger bound_generation_file_delete before delete on maintenance_private.household_attachments for each row execute function maintenance_private.guard_bound_generation_file_delete();
alter table maintenance_private.household_copy_intents enable always trigger bound_generation_file_delete;
alter table maintenance_private.household_attachments enable always trigger bound_generation_file_delete;
create function maintenance_private.generation_file_binding_archived(gid uuid,intent uuid,input_value jsonb) returns boolean
language sql stable security definer set search_path='' as $$select exists(select 1 from maintenance_private.generation_file_preparation_cancellations c join maintenance_private.generation_file_preparations g using(generation_id) join private.kb_shared_deletion_journal j on j.request_id=g.root_request cross join lateral jsonb_array_elements(c.before_state->'files')f where c.generation_id=gid and j.status='cancelled' and f->'binding'->>'intent_id'=intent::text and f->'binding'->'input'=input_value)$$;
do $patch$declare definition text;begin if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='maintenance_private.check_generation_file_copy_commit()'::regprocedure)<>'1ee9b2ce241b72891a4bda0bbd845d22d3ea07ae56dff397e8b255618780159f' then raise exception 'Exact file-cancellation dependency drift';end if;select pg_get_functiondef('maintenance_private.check_generation_file_copy_commit()'::regprocedure) into definition;definition:=replace(definition,'begin','begin'||chr(10)||' if maintenance_private.generation_file_binding_archived(new.generation_id,new.intent_id,new.input) then return null;end if;
');execute definition;end$patch$;
do $patch$declare definition text;begin if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='maintenance_private.guard_generation_file_root_transition()'::regprocedure)<>'31e6ab36e7982b0d42e75bfac6d601801529b7d6ecc45e2c1b1d6803753a4e7f' then raise exception 'Exact file-cancellation dependency drift';end if;select pg_get_functiondef('maintenance_private.guard_generation_file_root_transition()'::regprocedure) into definition;definition:=replace(definition,'begin','begin'||chr(10)||' if old.status=''requested'' and new.status=''cancelled'' and(to_jsonb(old)-''status'')=(to_jsonb(new)-''status'') and exists(select 1 from maintenance_private.generation_file_preparations g where g.root_request=old.request_id and maintenance_private.generation_file_cancelled_state(g.generation_id,g.scope,g.native_lease,true,''requested'')) then return new;end if;
');execute definition;end$patch$;
create function maintenance_private.check_generation_file_cancel_commit() returns trigger
language plpgsql security definer set search_path='' as $$declare g maintenance_private.generation_file_preparations;begin select * into g from maintenance_private.generation_file_preparations where generation_id=new.generation_id;if not maintenance_private.generation_file_cancelled_state(g.generation_id,g.scope,g.native_lease,true,'cancelled') then raise exception 'Exact root/file cancellation required at producing COMMIT';end if;return null;end$$;
create constraint trigger generation_file_cancel_commit after insert on maintenance_private.generation_file_preparation_cancellations deferrable initially deferred for each row execute function maintenance_private.check_generation_file_cancel_commit();
alter table maintenance_private.generation_file_preparation_cancellations enable always trigger generation_file_cancel_commit;
create function maintenance_private.read_generation_file_cancellation(gid uuid,s jsonb,n uuid,fresh boolean) returns table(receipt jsonb,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare c maintenance_private.generation_file_preparation_cancellations;begin if not maintenance_private.generation_file_cancelled_state(gid,s,n,fresh,'cancelled') then return;end if;select * into c from maintenance_private.generation_file_preparation_cancellations where generation_id=gid;return query select jsonb_build_object('kind','generation-unused-files-cancelled/v1','requestID',s->>'requestID','generationID',gid,'fingerprint',encode(sha256(convert_to(c.before_state::text,'UTF8')),'hex'),'fileCount',jsonb_array_length(c.before_state->'files'),'sourcePreservedAtCommit',true,'destinationsRetired',true,'capacityBytesHeld',true,'capacityReleased',false,'accountErasureConfirmed',false),pg_backend_pid(),txid_current()::text;end$$;
do $$declare p record;begin for p in select oid::regprocedure f from pg_proc where pronamespace='maintenance_private'::regnamespace and proname in('generation_file_cancellation_caller','generation_file_preserved_snapshot','generation_unused_file_state','preview_generation_file_cancellation','generation_file_cancelled_state','apply_generation_file_cancellation','guard_bound_generation_file_delete','generation_file_binding_archived','check_generation_file_cancel_commit','read_generation_file_cancellation') loop execute format('revoke all on function %s from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_generation_file_backend,shared_retirement_backend',p.f);end loop;end$$;
grant usage on schema private,maintenance_private to shared_retirement_backend;
grant execute on function maintenance_private.preview_generation_file_cancellation(uuid,jsonb,uuid),maintenance_private.apply_generation_file_cancellation(uuid,jsonb,uuid,text,jsonb),maintenance_private.read_generation_file_cancellation(uuid,jsonb,uuid,boolean) to shared_retirement_backend;
