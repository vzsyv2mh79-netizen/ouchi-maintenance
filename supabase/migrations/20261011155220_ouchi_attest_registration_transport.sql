begin;
-- Trusted-server transport only. This is not Apple proof or endpoint activation.
create function public.issue_maintenance_attest_registration_challenge(payload jsonb,client_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c maintenance_private.attest_registration_challenges;u uuid;s uuid;e uuid;r uuid;accepted_at timestamptz;
begin
 u=(payload->>'userID')::uuid;s=(payload->>'sessionID')::uuid;e=(payload->>'epochID')::uuid;r=(payload->>'requestID')::uuid;
 if u is null or s is null or e is null or r is null then return null; end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 if public.read_maintenance_explicit_enrollment(u,s) is distinct from e then return null; end if;
 accepted_at=clock_timestamp();
 if not exists(select 1 from auth.sessions where id=s and user_id=u and (not_after is null or not_after>accepted_at)) then return null; end if;
 select * into c from maintenance_private.attest_registration_challenges where request_id=r for update;
 if found then
  if c.user_id=u and c.session_id=s and c.app_epoch_id=e and c.key_id=payload->>'keyID' and c.app_id=payload->>'appID'
  and c.attest_environment=payload->>'attestEnvironment' and c.consumed_at is null and c.issued_at<=accepted_at and c.expires_at>accepted_at then return c.challenge; end if;
  return null;
 end if;
 if exists(select 1 from maintenance_private.restore_attested_keys where key_id=payload->>'keyID')
 or (select count(*) from maintenance_private.attest_registration_challenges where user_id=u and expires_at>accepted_at)>=5 then return null; end if;
 insert into maintenance_private.attest_registration_challenges(request_id,user_id,session_id,app_epoch_id,key_id,app_id,attest_environment,challenge,nonce,client_data_sha256,issued_at,expires_at)
 values(r,u,s,e,payload->>'keyID',payload->>'appID',payload->>'attestEnvironment',payload,payload->>'nonce',client_hash,to_timestamp((payload->>'issuedAt')::numeric/1000),to_timestamp((payload->>'expiresAt')::numeric/1000))
 on conflict(request_id) do nothing returning * into c;
 if not found then return null; end if;
 return c.challenge;
end;$$;
create function public.read_maintenance_attest_registration_challenge(target_request uuid,target_user uuid,verified_session uuid,target_epoch uuid,target_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c maintenance_private.attest_registration_challenges;accepted_at timestamptz;
begin
 if target_epoch is null then return null; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch then return null; end if;
 select * into c from maintenance_private.attest_registration_challenges where request_id=target_request and user_id=target_user and session_id=verified_session and app_epoch_id=target_epoch and key_id=target_key for share;
 if not found then return null; end if;
 accepted_at=clock_timestamp();
 if not exists(select 1 from auth.sessions where id=verified_session and user_id=target_user and (not_after is null or not_after>accepted_at)) then return null; end if;
 if c.issued_at>accepted_at or c.expires_at<=accepted_at then return null; end if;
 -- A consumed challenge remains readable for an exact verified lost-ack retry.
 return c.challenge;
end;$$;
revoke all on function public.issue_maintenance_attest_registration_challenge(jsonb,text),public.read_maintenance_attest_registration_challenge(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.issue_maintenance_attest_registration_challenge(jsonb,text),public.read_maintenance_attest_registration_challenge(uuid,uuid,uuid,uuid,text) to service_role;
create or replace function public.commit_maintenance_attested_registration(target_request uuid,target_user uuid,verified_session uuid,target_epoch uuid,target_key text,verified_client_hash text,verified_attestation_hash text,verified_public_key bytea,verified_receipt bytea) returns boolean
language plpgsql security invoker set search_path='' as $$
declare c maintenance_private.attest_registration_challenges;k maintenance_private.restore_attested_keys;accepted_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if target_epoch is null or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch then return false; end if;
 select * into c from maintenance_private.attest_registration_challenges where request_id=target_request and user_id=target_user and session_id=verified_session and app_epoch_id=target_epoch and key_id=target_key for update;
 if not found then return false; end if;
 -- Serialize cross-account ownership for this key after the common account lock.
 -- The global key PK also refuses races with legacy privileged writers.
 perform pg_advisory_xact_lock(hashtext('ouchi.attest.key.'||target_key));
 if public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch then return false; end if;
 accepted_at=clock_timestamp();
 if not exists(select 1 from auth.sessions where id=verified_session and user_id=target_user and (not_after is null or not_after>accepted_at)) then return false; end if;
 if c.issued_at>accepted_at or c.expires_at<=accepted_at or verified_client_hash is distinct from c.client_data_sha256
 or verified_attestation_hash is null or verified_attestation_hash !~ '^[0-9a-f]{64}$'
 or verified_public_key is null or octet_length(verified_public_key)<>65 or get_byte(verified_public_key,0)<>4
 or encode(sha256(verified_public_key),'base64')<>target_key
 or verified_receipt is null or octet_length(verified_receipt) not between 1 and 65536 then return false; end if;
 select * into k from maintenance_private.restore_attested_keys where key_id=target_key for update;
 if c.consumed_at is not null then
  -- Exact lost-acknowledgement readback only. Never insert or reset a counter.
  return found and c.attestation_sha256=verified_attestation_hash and k.user_id=target_user and k.app_epoch_id=target_epoch
   and k.registration_session=verified_session and k.app_id=c.app_id and k.attest_environment=c.attest_environment
   and k.attestation_sha256=verified_attestation_hash and k.public_key_x962=verified_public_key and k.verified_receipt=verified_receipt;
 end if;
 if found then return false; end if;
 insert into maintenance_private.restore_attested_keys(key_id,user_id,app_epoch_id,registration_session,app_id,attest_environment,public_key_x962,attestation_sha256,verified_receipt)
 values(target_key,target_user,target_epoch,verified_session,c.app_id,c.attest_environment,verified_public_key,verified_attestation_hash,verified_receipt)
 on conflict(key_id) do nothing;
 if not found then return false; end if;
 update maintenance_private.attest_registration_challenges set consumed_at=accepted_at,attestation_sha256=verified_attestation_hash where request_id=target_request;
 return true;
end;$$;
commit;
