begin;
-- Does not enable strict enrollment. Once operator rollout enables it, ordinary
-- UPDATE cannot restore the unsafe implicit-enrollment path after erasure.
-- A reviewed schema migration is required for any rollback strategy.
create function maintenance_private.guard_explicit_enrollment_policy() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op in ('DELETE','TRUNCATE') then raise exception 'Enrollment policy cannot be removed'; end if;
 if old.require_explicit and not new.require_explicit then raise exception 'Explicit enrollment policy cannot be reversed'; end if;
 return new;
end;$$;
revoke all on function maintenance_private.guard_explicit_enrollment_policy() from public,anon,authenticated;
create trigger guard_explicit_enrollment_policy before update or delete on maintenance_private.enrollment_policy
for each row execute function maintenance_private.guard_explicit_enrollment_policy();
create trigger guard_explicit_enrollment_policy_truncate before truncate on maintenance_private.enrollment_policy
for each statement execute function maintenance_private.guard_explicit_enrollment_policy();
commit;
