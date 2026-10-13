-- Undeployed review candidate. No public RPC, worker grants or production writes.
create table private.kb_shared_family_completion_contexts(
 token uuid primary key,request_id uuid not null,household_id uuid not null,
 scope jsonb not null,plan jsonb not null,plan_digest text not null check(plan_digest ~ '^[a-f0-9]{64}$'),
 proofs jsonb not null,retained_snapshot jsonb not null,committed_at_ms bigint not null,
 lease_token uuid not null,backend_pid int not null,transaction_id bigint not null,expires_at timestamptz not null,
 unique(request_id,household_id),foreign key(request_id,household_id) references private.kb_shared_handoff_plans);
create table private.kb_shared_family_completions(like private.kb_shared_family_completion_contexts including all);
alter table private.kb_shared_family_completions add foreign key(token) references private.kb_shared_family_completion_contexts(token);
alter table private.kb_shared_family_completion_contexts enable row level security;
alter table private.kb_shared_family_completions enable row level security;
revoke all on private.kb_shared_family_completion_contexts,private.kb_shared_family_completions from public,anon,authenticated,service_role;
create function private.kb_refuse_family_completion_change() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Immutable committed family evidence';end $$;
revoke all on function private.kb_refuse_family_completion_change() from public,anon,authenticated,service_role;
create trigger immutable_kakei_family_context before update or delete on private.kb_shared_family_completion_contexts for each row execute function private.kb_refuse_family_completion_change();
create trigger immutable_kakei_family_completion before update or delete on private.kb_shared_family_completions for each row execute function private.kb_refuse_family_completion_change();
create function private.kb_check_family_completion_commit() returns trigger language plpgsql security invoker set search_path='' as $$
declare c private.kb_shared_family_completion_contexts;r private.kb_shared_family_completions;j private.kb_shared_deletion_journal;
 p jsonb;proofs jsonb;snapshot jsonb;
begin
 select * into c from private.kb_shared_family_completion_contexts where token=new.token;
 select * into r from private.kb_shared_family_completions where token=new.token;
 select * into j from private.kb_shared_deletion_journal where request_id=c.request_id;
 select plan into p from private.kb_shared_handoff_plans where request_id=c.request_id and household_id=c.household_id;
 select jsonb_agg(jsonb_build_object('actorID',actor_id,'token',token,'revokedAt',revoked_at) order by actor_id) into proofs
 from private.kb_shared_handoff_proofs where request_id=c.request_id and household_id=c.household_id;
 select jsonb_build_object('home',(select to_jsonb(h)-'updated_at' from public.kb_households h where id=c.household_id),
 'members',(select coalesce(jsonb_agg(to_jsonb(m) order by user_id),'[]') from public.kb_household_members m where household_id=c.household_id and user_id<>j.user_id),
 'records',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.kb_transactions t where household_id=c.household_id and created_by<>j.user_id)) into snapshot;
 if c.token is null or r.token is null or to_jsonb(c) is distinct from to_jsonb(r)
 or c.token::text is distinct from current_setting('kakei.family_completion_context',true)
 or c.backend_pid<>pg_backend_pid() or c.transaction_id<>txid_current() or c.expires_at<=clock_timestamp()
 or j.request_id is null or j.status<>'processing' or j.lease_token<>c.lease_token or j.lease_until<=clock_timestamp()
 or j.scope is distinct from c.scope or p is distinct from c.plan
 or (j.receipts->'prepare'->>'durable') is distinct from 'true'
 or ((j.receipts->'prepare')-'durable'-'stage') is distinct from j.scope
 or j.receipts->'prepare'->>'stage' is distinct from 'prepare'
 or c.proofs is distinct from proofs or jsonb_array_length(c.proofs)<>2
 or exists(select 1 from jsonb_array_elements(c.proofs) v where v->>'revokedAt' is not null)
 or c.committed_at_ms>floor(extract(epoch from clock_timestamp())*1000) or c.committed_at_ms<floor(extract(epoch from clock_timestamp())*1000)-5000
 or snapshot is distinct from c.retained_snapshot
 or not exists(select 1 from public.kb_households h where h.id=c.household_id and h.owner_id::text=c.plan->>'successorID')
 or not exists(select 1 from public.kb_household_members m where m.household_id=c.household_id and m.user_id::text=c.plan->>'successorID' and m.role='owner')
 or not exists(select 1 from public.kb_household_members m where m.household_id=c.household_id and m.user_id=j.user_id and m.role='member')
 then raise exception 'Exact current family completion required at COMMIT';end if;
 return null;
end $$;
revoke all on function private.kb_check_family_completion_commit() from public,anon,authenticated,service_role;
create constraint trigger kakei_family_context_commit after insert on private.kb_shared_family_completion_contexts deferrable initially deferred for each row execute function private.kb_check_family_completion_commit();
create constraint trigger kakei_family_completion_commit after insert on private.kb_shared_family_completions deferrable initially deferred for each row execute function private.kb_check_family_completion_commit();
