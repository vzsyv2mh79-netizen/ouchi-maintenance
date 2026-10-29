-- Review-only BEFORE-NATIVE authority. No live migration or destructive port.
-- Old post-handoff/canonical bodies are preserved, not broadened after logout.
do $after$declare d text;b text;begin
 select pg_get_functiondef(oid),prosrc into d,b from pg_proc where oid='maintenance_private.generation_post_handoff_frame(uuid)'::regprocedure;
 if encode(sha256(convert_to(b,'UTF8')),'hex')<>'0b93c7d140f1114db8b2b7b6b873befcc594245a8c524715028a128e05691e19' then raise exception 'Exact before-logout frame dependency drift';end if;
 d:=replace(d,'maintenance_private.generation_post_handoff_frame(', 'maintenance_private.generation_after_logout_frame_core(');
 -- Only the actual owner-session disappearance is a legitimate post-logout
 -- native-observation delta. ALL other original before/after JSON is unchanged.
 d:=replace(d,'after_value is distinct from w.after_state','jsonb_set(after_value,''{owner,sessions}'',w.after_state#>''{owner,sessions}'') is distinct from w.after_state');
 d:=replace(d,'((after_value->''owner'')-''contentDigest'')','(jsonb_set(after_value->''owner'',''{sessions}'',w.before_state#>''{owner,sessions}'')-''contentDigest'')');
 execute d;
end$after$;
create function maintenance_private.generation_after_logout_frame(gid uuid,s jsonb,n uuid,targets jsonb)
returns table(custody jsonb,auth_core_digest text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;j private.kb_shared_deletion_journal;u uuid;actors uuid[];dep record;h record;begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none' then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets then return;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request for update;
 if j.status is distinct from 'processing' or j.scope is distinct from s-'leaseToken' or j.user_id is distinct from g.actor or j.lease_token::text is distinct from s->>'leaseToken' or j.lease_until is null or j.lease_until<=clock_timestamp() or not maintenance_private.generation_session_prefix_matches(gid) then return;end if;
 select array_agg(distinct (m->>'actorID')::uuid order by (m->>'actorID')::uuid) into actors from jsonb_array_elements(g.roster) home cross join lateral jsonb_array_elements(home->'members') m;
 if actors is null or not(g.actor=any(actors)) then return;end if;
 foreach u in array actors loop perform pg_advisory_xact_lock(hashtext(u::text));end loop;
 for dep in select * from(values('auth.sessions','user_id','auth.users','id'),('auth.mfa_factors','user_id','auth.users','id')) required(child,col,parent,parent_col) loop
  if not exists(select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] join pg_attribute p on p.attrelid=c.confrelid and p.attnum=c.confkey[1]
   where c.contype='f' and c.convalidated and not c.condeferrable and cardinality(c.conkey)=1 and cardinality(c.confkey)=1 and c.conrelid=to_regclass(dep.child) and c.confrelid=to_regclass(dep.parent) and a.attname=dep.col and p.attname=dep.parent_col) then return;end if;
 end loop;
 -- Current user row MUST exist. Holding Auth parents through COMMIT prevents
 -- session/factor recreation via the validated immediate FKs. No external API
 -- call, Auth DELETE or JWT impersonation takes place under these locks.
 perform id from auth.users where id=any(actors) and deleted_at is null order by id for update;
 if (select count(*) from auth.users where id=any(actors) and deleted_at is null)<>cardinality(actors) then return;end if;
 perform id from auth.mfa_factors where user_id=any(actors) order by user_id,id for update;
 if exists(select 1 from auth.sessions where user_id=g.actor) then return;end if;
 perform 1 from maintenance_private.generation_after_logout_frame_core(gid);if not found then return;end if;
 select * into h from maintenance_private.read_generation_session_history(gid,s,n,targets);if not found then return;end if;
 -- No raw Auth/current capability is transported. HMAC is independently checked
 -- by the generation session-custody wrapper on the SAME physical transaction.
 return query select h.proof,encode(sha256(convert_to(jsonb_build_object('user',(select to_jsonb(a) from auth.users a where id=g.actor),'factors',(select coalesce(jsonb_agg(to_jsonb(f) order by id),'[]') from auth.mfa_factors f where user_id=g.actor))::text,'UTF8')),'hex'),pg_backend_pid(),txid_current()::text;
end$$;
revoke all on function maintenance_private.generation_after_logout_frame_core(uuid),maintenance_private.generation_after_logout_frame(uuid,jsonb,uuid,jsonb) from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend,ouchi_retention_checker_backend;
grant execute on function maintenance_private.generation_after_logout_frame(uuid,jsonb,uuid,jsonb) to shared_retirement_backend;
