begin;
-- Trusted caller must verify current Auth and both Apple JWS signatures first.
-- Read-only preparation: no consumption, job creation, Apple update or rights.
create function public.read_maintenance_restore_verification_context(
 target_request uuid,target_user uuid,verified_session uuid,target_epoch uuid,target_key text,
 expected_app text,expected_attest_environment text,verified_pair_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare k jsonb;c maintenance_private.restore_challenges;now_at timestamptz;
begin
 if target_request is null or target_request='00000000-0000-0000-0000-000000000000'::uuid
 or verified_pair_hash is null or verified_pair_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 -- Existing scoped key read holds account/policy/key locks through this transaction.
 k=public.read_maintenance_restore_key(target_user,verified_session,target_epoch,target_key,expected_app,expected_attest_environment);
 if k is null then return null; end if;
 select * into c from maintenance_private.restore_challenges where request_id=target_request
 and user_id=target_user and session_id=verified_session and app_epoch_id=target_epoch and key_id=target_key for share;
 now_at=clock_timestamp();
 if not found or c.consumed_at is not null or c.issued_at>now_at or c.expires_at<=now_at
 or c.challenge->>'appID' is distinct from expected_app
 or c.challenge->>'attestEnvironment' is distinct from expected_attest_environment
 or c.challenge->>'purchaseEnvironment' is distinct from 'Sandbox'
 or c.challenge->>'proofSHA256' is distinct from verified_pair_hash
 or encode(sha256(convert_to(maintenance_private.restore_client_data(c.challenge),'UTF8')),'hex') is distinct from c.client_data_sha256 then return null; end if;
 return jsonb_build_object('key',k,'challenge',c.challenge,'clientDataSHA256',c.client_data_sha256);
end;$$;
revoke all on function public.read_maintenance_restore_verification_context(uuid,uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.read_maintenance_restore_verification_context(uuid,uuid,uuid,uuid,text,text,text,text) to service_role;
commit;
