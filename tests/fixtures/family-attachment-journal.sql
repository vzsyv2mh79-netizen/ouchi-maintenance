-- Disposable review schema only. No Data API grants, migration or production
-- provider. A planned inventory is NOT quota reservation or activation proof.
create table maintenance_private.family_attachment_journals (
 request_id uuid not null,
 home_id uuid not null,
 scope jsonb not null check(jsonb_typeof(scope)='object'),
 plan jsonb not null check(jsonb_typeof(plan)='object'),
 plan_digest text not null check(plan_digest ~ '^[0-9a-f]{64}$'),
 inventory jsonb not null check(jsonb_typeof(inventory)='object'),
 inventory_digest text not null check(inventory_digest ~ '^[0-9a-f]{64}$'),
 state text not null default 'planned' check(state='planned'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(request_id,home_id),
 check(scope->>'requestID'=request_id::text),
 check(scope->>'homeID'=home_id::text),
 check(plan->>'requestID'=request_id::text),
 check(plan->>'homeID'=home_id::text)
);
alter table maintenance_private.family_attachment_journals enable row level security;
revoke all on maintenance_private.family_attachment_journals from public,anon,authenticated,service_role;
-- No cascading Auth/home foreign key: retiring the old principal must not erase
-- the custody evidence. Finite receipt retention needs a separate approved job.
create function maintenance_private.refuse_family_attachment_journal_change()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Immutable family attachment inventory'; end $$;
revoke all on function maintenance_private.refuse_family_attachment_journal_change() from public,anon,authenticated,service_role;
create trigger immutable_family_attachment_journal before update or delete
on maintenance_private.family_attachment_journals for each row
execute function maintenance_private.refuse_family_attachment_journal_change();
