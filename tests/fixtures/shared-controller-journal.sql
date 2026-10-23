-- Local synthetic database only; not a production migration or permission grant.
create schema if not exists private;
create table private.kb_shared_deletion_journal (
 request_id uuid primary key,
 user_id uuid not null,
 scope jsonb not null,
 status text not null check(status in ('requested','processing','cancelled','complete')),
 lease_token uuid,
 lease_until timestamptz,
 receipts jsonb not null default '{}',
 check((status='processing' and lease_token is not null and lease_until is not null)
   or (status<>'processing' and lease_token is null and lease_until is null))
);
-- No Auth FK: synthetic Auth removal must not erase completion evidence.
create unique index kb_shared_deletion_active_user on private.kb_shared_deletion_journal(user_id)
 where status in ('requested','processing');
alter table private.kb_shared_deletion_journal enable row level security;
revoke all on private.kb_shared_deletion_journal from public;
