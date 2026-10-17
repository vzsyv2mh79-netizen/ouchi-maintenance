begin;
-- Prepared service-only Sandbox transport. No enabled policy, ownership update,
-- Apple mutation or shared database application is included.
create function maintenance_private.restore_client_data(c jsonb) returns text
language sql immutable strict security invoker set search_path='' as $$
 select format('{"version":1,"purpose":"restore_ouchi_subscription","nonce":"%s","issuedAt":%s,"expiresAt":%s,"userID":"%s","sessionID":"%s","epochID":"%s","requestID":"%s","keyID":"%s","appID":"%s","attestEnvironment":"%s","purchaseEnvironment":"Sandbox","proofSHA256":"%s"}',c->>'nonce',c->>'issuedAt',c->>'expiresAt',c->>'userID',c->>'sessionID',c->>'epochID',c->>'requestID',c->>'keyID',c->>'appID',c->>'attestEnvironment',c->>'proofSHA256');
$$;
create function public.read_maintenance_restore_key(target_user uuid,verified_session uuid,target_epoch uuid,target_key text,expected_app text,expected_attest_environment text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare k maintenance_private.restore_attested_keys;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.restore_transfer_policy where id=1 and enabled for share;
 if not found or target_user is null or verified_session is null or target_epoch is null
 or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch then return null; end if;
 select * into k from maintenance_private.restore_attested_keys where key_id=target_key and user_id=target_user and app_epoch_id=target_epoch and app_id=expected_app and attest_environment=expected_attest_environment for share;
 if not found then return null; end if;
 return jsonb_build_object('userID',k.user_id,'epochID',k.app_epoch_id,'keyID',k.key_id,'appID',k.app_id,'attestEnvironment',k.attest_environment,'publicKeyHex',encode(k.public_key_x962,'hex'),'counter',k.assertion_counter);
end;$$;
create function public.issue_maintenance_restore_challenge(payload jsonb,client_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare k maintenance_private.restore_attested_keys; c maintenance_private.restore_challenges; u uuid; s uuid; e uuid; r uuid; now_at timestamptz; issued timestamptz; expiry timestamptz; field_name text;
begin
 if payload is null or jsonb_typeof(payload)<>'object' or client_hash is null or client_hash !~ '^[0-9a-f]{64}$'
 or (select count(*) from jsonb_object_keys(payload))<>14 or payload->'version' is distinct from '1'::jsonb
 or payload->>'purpose' is distinct from 'restore_ouchi_subscription' or payload->>'purchaseEnvironment' is distinct from 'Sandbox'
 or payload->>'issuedAt' !~ '^[1-9][0-9]{0,15}$' or payload->>'expiresAt' !~ '^[1-9][0-9]{0,15}$'
 or payload->>'proofSHA256' !~ '^[0-9a-f]{64}$'
 or encode(sha256(convert_to(maintenance_private.restore_client_data(payload),'UTF8')),'hex')<>client_hash then return null; end if;
 for field_name in select unnest(array['userID','sessionID','epochID','requestID','keyID','appID','attestEnvironment','purchaseEnvironment','proofSHA256','purpose','nonce']) loop
  if jsonb_typeof(payload->field_name) is distinct from 'string' then return null; end if;
 end loop;
 if jsonb_typeof(payload->'issuedAt') is distinct from 'number' or jsonb_typeof(payload->'expiresAt') is distinct from 'number'
 or payload->>'nonce' !~ '^[A-Za-z0-9_-]{43}$'
 or rtrim(translate(encode(decode(translate(payload->>'nonce','-_','+/')||'=','base64'),'base64'),'+/','-_'),'=')<>payload->>'nonce' then return null; end if;
 u=(payload->>'userID')::uuid; s=(payload->>'sessionID')::uuid; e=(payload->>'epochID')::uuid; r=(payload->>'requestID')::uuid;
 if u::text is distinct from payload->>'userID' or s::text is distinct from payload->>'sessionID' or e::text is distinct from payload->>'epochID' or r::text is distinct from payload->>'requestID'
 or u is null or s is null or e is null or r is null or u=e
 or u='00000000-0000-0000-0000-000000000000'::uuid or s='00000000-0000-0000-0000-000000000000'::uuid
 or e='00000000-0000-0000-0000-000000000000'::uuid or r='00000000-0000-0000-0000-000000000000'::uuid then return null; end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 perform 1 from maintenance_private.restore_transfer_policy where id=1 and enabled for share;
 if not found or public.read_maintenance_explicit_enrollment(u,s) is distinct from e then return null; end if;
 select * into k from maintenance_private.restore_attested_keys where key_id=payload->>'keyID' and user_id=u and app_epoch_id=e and app_id=payload->>'appID' and attest_environment=payload->>'attestEnvironment' for update;
 if not found then return null; end if;
 now_at=clock_timestamp();
 select * into c from maintenance_private.restore_challenges where request_id=r for update;
 if found then
  if c.user_id=u and c.session_id=s and c.app_epoch_id=e and c.key_id=k.key_id
  and c.challenge->>'appID'=k.app_id and c.challenge->>'attestEnvironment'=k.attest_environment
  and c.challenge->>'purchaseEnvironment'='Sandbox' and c.challenge->>'proofSHA256'=payload->>'proofSHA256'
  and c.consumed_at is null and c.issued_at<=now_at and c.expires_at>now_at then return c.challenge; end if;
  return null;
 end if;
 issued=to_timestamp((payload->>'issuedAt')::numeric/1000); expiry=to_timestamp((payload->>'expiresAt')::numeric/1000);
 if issued>now_at or expiry<=now_at or expiry<>issued+interval '5 minutes' then return null; end if;
 -- Expired nonce data only; retained transfer jobs are independent and unchanged.
 delete from maintenance_private.restore_challenges where request_id in (select request_id from maintenance_private.restore_challenges where user_id=u and key_id=k.key_id and expires_at<=now_at order by expires_at,request_id limit 100);
 if (select count(*) from maintenance_private.restore_challenges where user_id=u and key_id=k.key_id and consumed_at is null and expires_at>now_at)>=5 then return null; end if;
 insert into maintenance_private.restore_challenges(request_id,user_id,session_id,app_epoch_id,key_id,challenge,nonce,client_data_sha256,issued_at,expires_at)
 values(r,u,s,e,k.key_id,payload,payload->>'nonce',client_hash,issued,expiry);
 return payload;
end;$$;
revoke all on function maintenance_private.restore_client_data(jsonb),public.read_maintenance_restore_key(uuid,uuid,uuid,text,text,text),public.issue_maintenance_restore_challenge(jsonb,text) from public,anon,authenticated;
grant execute on function maintenance_private.restore_client_data(jsonb),public.read_maintenance_restore_key(uuid,uuid,uuid,text,text,text),public.issue_maintenance_restore_challenge(jsonb,text) to service_role;
commit;
