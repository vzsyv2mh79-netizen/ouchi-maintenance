-- Additive, service-only read. Auth.getUser must verify the exact bearer first.
-- Does not enable sales or change any free household policy.
begin;
create function public.read_maintenance_verified_entitlement(
  target_user uuid, verified_session uuid, target_epoch uuid, target_environment text
) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  binding uuid;
  active_product text;
  active_expiry bigint;
  now_ms bigint := floor(extract(epoch from statement_timestamp()) * 1000)::bigint;
begin
  if target_environment is null or target_environment not in ('Sandbox','Production') then
    raise exception 'Invalid purchase environment';
  end if;
  binding := public.current_maintenance_purchase_account(target_user, verified_session);
  if binding is null or target_epoch is null or binding <> target_epoch then
    raise exception 'Purchase account unavailable';
  end if;
  select t.product_id, t.expires_at into active_product, active_expiry
    from maintenance_private.verified_transactions t
    where t.user_id = target_user and t.app_epoch_id = target_epoch
      and t.environment = target_environment
      and t.product_id in ('ouchi.premium.monthly','ouchi.premium.annual')
      and t.revoked_at is null and not t.is_upgraded
      and t.purchased_at <= now_ms and t.expires_at > now_ms
    order by t.expires_at desc, t.transaction_id asc limit 1;
  if active_product is null then
    return jsonb_build_object('plan','free','environment',target_environment);
  end if;
  return jsonb_build_object('plan','premium','productId',active_product,
    'expiresAt',active_expiry,'environment',target_environment);
end;
$$;
revoke all on function public.read_maintenance_verified_entitlement(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.read_maintenance_verified_entitlement(uuid,uuid,uuid,text) to service_role;
commit;
