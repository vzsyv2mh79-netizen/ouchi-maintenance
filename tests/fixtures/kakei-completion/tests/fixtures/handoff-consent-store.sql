-- Isolated development DB only. No production grants or migration.
create table private.kb_shared_handoff_plans (
 request_id uuid references private.kb_shared_deletion_journal on delete cascade,
 household_id uuid not null,plan jsonb not null,primary key(request_id,household_id)
);
create table private.kb_shared_handoff_proofs (
 request_id uuid not null,household_id uuid not null,actor_id uuid not null,
 token text not null,revoked_at timestamptz,
 primary key(request_id,household_id,actor_id),
 foreign key(request_id,household_id) references private.kb_shared_handoff_plans on delete cascade
);
alter table private.kb_shared_handoff_plans enable row level security;
alter table private.kb_shared_handoff_proofs enable row level security;
revoke all on private.kb_shared_handoff_plans,private.kb_shared_handoff_proofs from public;
