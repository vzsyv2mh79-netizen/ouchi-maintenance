import {createHash} from 'node:crypto';

export const OUCHI_AUTH_EXCLUSION_DOMAIN='OuchiMaintenance/auth-recreation-exclusion/v1:';
export function ouchiAuthRecreationKey(actor){
 if(typeof actor!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor)||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(actor))throw Error('Exact Auth actor required');
 return createHash('sha256').update(OUCHI_AUTH_EXCLUSION_DOMAIN+actor.toLowerCase()).digest().readBigInt64BE(0);
}

// Fixed reviewed function body. The deployment candidate and metadata verifier
// must match this byte-for-byte; no runtime SQL/body configuration is accepted.
// UPDATE OF id is also guarded: INSERT-only cannot prevent UUID renaming in SQL.
export const OUCHI_AUTH_INSERT_GUARD_BODY=`
declare next_key bigint;prior_key bigint;first_key bigint;second_key bigint;
begin
 if TG_TABLE_SCHEMA<>'auth' or TG_TABLE_NAME<>'users' or TG_WHEN<>'BEFORE'
 or TG_LEVEL<>'ROW' or TG_NARGS<>0 or TG_OP not in('INSERT','UPDATE') then
  raise exception 'Unexpected Auth identity guard context' using errcode='55000';
 end if;
 if NEW.id is null then raise exception 'Auth identity ID required' using errcode='23502';end if;
 if TG_OP='UPDATE' and NEW.id is not distinct from OLD.id then return NEW;end if;
 next_key:=('x'||pg_catalog.encode(pg_catalog.substr(pg_catalog.sha256(pg_catalog.convert_to('OuchiMaintenance/auth-recreation-exclusion/v1:'||NEW.id::text,'UTF8')),1,8),'hex'))::bit(64)::bigint;
 first_key:=next_key;second_key:=next_key;
 if TG_OP='UPDATE' then
  prior_key:=('x'||pg_catalog.encode(pg_catalog.substr(pg_catalog.sha256(pg_catalog.convert_to('OuchiMaintenance/auth-recreation-exclusion/v1:'||OLD.id::text,'UTF8')),1,8),'hex'))::bit(64)::bigint;
  first_key:=least(next_key,prior_key);second_key:=greatest(next_key,prior_key);
 end if;
 if pg_catalog.pg_try_advisory_xact_lock(first_key) is not true then
  raise exception 'Auth identity write excluded during account retirement' using errcode='55000';
 end if;
 if second_key<>first_key and pg_catalog.pg_try_advisory_xact_lock(second_key) is not true then
  raise exception 'Auth identity write excluded during account retirement' using errcode='55000';
 end if;
 return NEW;
end;
`;
export const OUCHI_AUTH_INSERT_GUARD_SHA256=createHash('sha256').update(OUCHI_AUTH_INSERT_GUARD_BODY).digest('hex');
