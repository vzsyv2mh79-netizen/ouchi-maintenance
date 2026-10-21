-- Undeployed successor-only CURRENT verifier after real owner global logout.
-- Copy strict Auth body exactly except the new fixed-generation frame call.
do $successor$declare d text;b text;begin
 select pg_get_functiondef(oid),prosrc into d,b from pg_proc where oid='maintenance_private.generation_family_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,uuid)'::regprocedure;
 if encode(sha256(convert_to(b,'UTF8')),'hex')<>'7f48d51d0fe1d983d4164b14428ab44545b2ea2ce5b2ee2b4006256971e17ba4' then raise exception 'Strict generation Auth dependency drift';end if;
 d:=replace(d,'maintenance_private.generation_family_auth(', 'maintenance_private.generation_successor_after_logout_auth(');
 d:=replace(d,'perform 1 from maintenance_private.generation_family_frame(p_generation);',
 'perform 1 from maintenance_private.generation_after_logout_frame(p_generation,(select scope from maintenance_private.family_preparation_generations where generation_id=p_generation),(select native_lease from maintenance_private.family_preparation_generations where generation_id=p_generation),(select targets from maintenance_private.family_preparation_generations where generation_id=p_generation));');
 execute d;
end$successor$;
create function maintenance_private.read_generation_successor_after_logout(gid uuid,s jsonb,n uuid,targets jsonb,h uuid,u uuid,timebox_seconds bigint,inactivity_seconds bigint)
returns table(payload jsonb,signature text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;p maintenance_private.generation_family_originals;a record;begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none' then return;end if;
 perform 1 from maintenance_private.generation_after_logout_frame(gid,s,n,targets);if not found then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.actor=u or not exists(select 1 from maintenance_private.family_preparation_generation_homes t where t.generation_id=gid and t.home_id=h and t.successor_id=u) then return;end if;
 select * into p from maintenance_private.generation_family_originals where generation_id=gid and home_id=h and actor_id=u;
 if not found or p.timebox_seconds is distinct from timebox_seconds or p.inactivity_seconds is distinct from inactivity_seconds then return;end if;
 -- A successor still needs CURRENT enabled app enrollment and an open actor,
 -- not just an old shared-home roster or a valid global JWT.
 perform 1 from maintenance_private.account_access where user_id=u and enabled for update;if not found then return;end if;
 perform 1 from maintenance_private.app_epochs where user_id=u and epoch_id::text=p.payload->>'epochID' and enabled for update;if not found then return;end if;
 perform 1 from maintenance_private.household_principal_fences where user_id=u for update;
 if exists(select 1 from maintenance_private.household_principal_fences where user_id=u and stopped) or exists(select 1 from maintenance_private.household_stop_bindings where user_id=u) then return;end if;
 select * into a from maintenance_private.generation_successor_after_logout_auth(g.root_request,h,u,(p.payload->>'sessionID')::uuid,n,'aal2',(p.payload->>'authenticatedAt')::bigint,timebox_seconds,inactivity_seconds,gid);
 if not found or a.epoch_id::text is distinct from p.payload->>'epochID' or a.auth_state_digest is distinct from p.payload->>'authStateDigest' or (p.payload->>'expiresAt')::bigint<=a.checked_at then return;end if;
 return query select p.payload,p.signature,pg_backend_pid(),txid_current()::text;
end$$;
revoke all on function maintenance_private.generation_successor_after_logout_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,uuid),maintenance_private.read_generation_successor_after_logout(uuid,jsonb,uuid,jsonb,uuid,uuid,bigint,bigint) from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend,ouchi_retention_checker_backend;
grant execute on function maintenance_private.read_generation_successor_after_logout(uuid,jsonb,uuid,jsonb,uuid,uuid,bigint,bigint) to shared_retirement_backend;
