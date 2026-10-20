-- Disposable integration permissions ONLY, not a production ACL proposal.
-- Exercise actual dedicated LOGIN/current Auth RPCs instead of the cluster
-- owner. Scope/content/lease/immutable-context triggers remain installed. These
-- broad metadata read policies still require a separate least-privilege review.
grant usage on schema public,maintenance_private to shared_retirement_backend;
grant execute on function maintenance_private.pin_initial_family_consent(uuid,uuid,uuid,uuid),
 maintenance_private.current_initial_family_identity(uuid,uuid,uuid,uuid,uuid,bigint,bigint),
 maintenance_private.read_initial_household_origin(uuid,uuid,uuid,uuid,uuid),
 maintenance_private.read_initial_family_activation(uuid,uuid,uuid,uuid),
 maintenance_private.household_family_snapshot(uuid),
 maintenance_private.current_family_attachment_activation(),
 maintenance_private.attachment_write_is_quiet(uuid),
 maintenance_private.allowed_household_handoff(jsonb,jsonb),
 maintenance_private.allowed_family_attachment_activation(text,jsonb,jsonb),
 maintenance_private.assert_household_principals(uuid[]),
 maintenance_private.assert_household_principals(uuid[],text,text,uuid,uuid) to shared_retirement_backend;
do $$declare relation text;begin
 foreach relation in array array[
 'account_deletion_requests','account_access','app_epochs','app_session_epochs',
 'product_attachments','attachment_write_attempts','household_stop_bindings',
 'household_handoff_plans','household_handoff_consents','household_family_holds',
 'household_handoff_contexts','household_handoff_receipts','household_write_routes',
 'family_attachment_journals','family_attachment_quota',
 'family_attachment_inventory_consents','family_attachment_inventory_approvals',
 'family_attachment_activation_contexts','family_attachment_activation_rows',
 'family_attachment_activation_receipts','family_attachment_completion_contexts',
 'family_attachment_completion_receipts'] loop
  execute format('grant select,update on maintenance_private.%I to shared_retirement_backend',relation);
  execute format('create policy initial_runtime_read on maintenance_private.%I for select to shared_retirement_backend using(true)',relation);
  execute format('create policy initial_runtime_lock on maintenance_private.%I for update to shared_retirement_backend using(true) with check(false)',relation);
 end loop;
 foreach relation in array array[
 'family_attachment_journals','family_attachment_quota','household_handoff_contexts','household_handoff_receipts',
 'family_attachment_inventory_approvals','family_attachment_activation_contexts','family_attachment_activation_rows',
 'family_attachment_activation_receipts','family_attachment_completion_contexts','family_attachment_completion_receipts'] loop
  execute format('grant insert on maintenance_private.%I to shared_retirement_backend',relation);
  execute format('create policy initial_runtime_insert on maintenance_private.%I for insert to shared_retirement_backend with check(true)',relation);
 end loop;
 foreach relation in array array['family_attachment_quota','product_attachments','attachment_write_attempts','household_write_routes'] loop
  execute format('create policy initial_runtime_update on maintenance_private.%I for update to shared_retirement_backend using(true) with check(true)',relation);
 end loop;
 foreach relation in array array['homes','home_members','products'] loop
  execute format('grant select,update on public.%I to shared_retirement_backend',relation);
  execute format('create policy initial_runtime_read on public.%I for select to shared_retirement_backend using(true)',relation);
  execute format('create policy initial_runtime_lock on public.%I for update to shared_retirement_backend using(true) with check(false)',relation);
 end loop;
 create policy initial_runtime_home_transfer on public.homes for update to shared_retirement_backend using(true) with check(true);
end $$;
