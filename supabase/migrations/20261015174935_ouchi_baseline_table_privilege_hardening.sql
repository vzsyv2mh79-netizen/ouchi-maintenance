-- Only the established Ouchi Web tables. No shared default privileges, other
-- applications, records, RLS policies or normal CRUD grants are changed.
-- Prepare/review first; do not use this as authorization for production apply.
revoke truncate, references, trigger on table
  public.homes,
  public.products,
  public.maintenance_tasks,
  public.maintenance_history,
  public.home_members,
  public.home_invites,
  public.maintenance_imports,
  public.maintenance_backup_restores,
  public.maintenance_push_subscriptions,
  public.maintenance_push_test_limits
from public, anon, authenticated;
