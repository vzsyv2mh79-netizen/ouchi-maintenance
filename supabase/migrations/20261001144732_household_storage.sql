-- One private household per account for this MVP. No service-role key in the browser.
create table public.homes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'わが家',
  kind text not null default 'home' check (kind in ('home','parents','second','rental'))
);
create table public.products (
  id uuid primary key,
  "homeId" uuid not null references public.homes(id) on delete cascade,
  "categoryId" text not null,
  maker text not null default '', name text not null check (length(trim(name)) > 0),
  "modelNumber" text not null default '',
  "purchaseDate" date, "installedDate" date, memo text
);
create index products_home_idx on public.products("homeId");
create table public.maintenance_tasks (
  id uuid primary key,
  "productId" uuid not null references public.products(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('掃除','交換','点検','補充')),
  "intervalDays" integer not null check ("intervalDays" between 1 and 3650),
  "lastCompletedAt" date, "nextDueAt" date not null,
  "sourceKind" text not null check ("sourceKind" in ('メーカー公式','取扱説明書','公的情報','一般的な目安','ユーザー設定')),
  "sourceUrl" text, "sourceNote" text, "sourceFrequency" text,
  check ("sourceKind" not in ('メーカー公式','取扱説明書','公的情報') or "sourceUrl" ~ '^https://'),
  unique(id, "productId")
);
create index tasks_product_due_idx on public.maintenance_tasks("productId", "nextDueAt");
create table public.maintenance_history (
  id uuid primary key default gen_random_uuid(),
  "taskId" uuid not null, "productId" uuid not null,
  "completedAt" date not null, note text,
  foreign key ("taskId", "productId") references public.maintenance_tasks(id, "productId") on delete cascade,
  unique ("taskId", "completedAt")
);
create index history_product_idx on public.maintenance_history("productId");
alter table public.homes enable row level security;
alter table public.products enable row level security;
alter table public.maintenance_tasks enable row level security;
alter table public.maintenance_history enable row level security;
create policy own_home on public.homes for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_products on public.products for all to authenticated
  using (exists (select 1 from public.homes h where h.id = "homeId" and h.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.homes h where h.id = "homeId" and h.owner_id = (select auth.uid())));
create policy own_tasks on public.maintenance_tasks for all to authenticated
  using (exists (select 1 from public.products p where p.id = "productId"))
  with check (exists (select 1 from public.products p where p.id = "productId"));
create policy own_history on public.maintenance_history for all to authenticated
  using (exists (select 1 from public.products p where p.id = "productId"))
  with check (exists (select 1 from public.products p where p.id = "productId"));
revoke all on public.homes, public.products, public.maintenance_tasks, public.maintenance_history from anon;
grant select, insert, update, delete on public.homes, public.products, public.maintenance_tasks, public.maintenance_history to authenticated;

-- All RPCs are invoker functions: the same ownership RLS applies to every query.
create function public.load_household() returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.homes(owner_id) values (auth.uid()) on conflict (owner_id) do nothing;
  return jsonb_build_object(
    'homes', (select coalesce(jsonb_agg(to_jsonb(h) - 'owner_id'), '[]'::jsonb) from public.homes h),
    'products', (select coalesce(jsonb_agg(to_jsonb(p) order by p.name), '[]'::jsonb) from public.products p),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t."nextDueAt"), '[]'::jsonb) from public.maintenance_tasks t),
    'history', (select coalesce(jsonb_agg(to_jsonb(h) order by h."completedAt" desc), '[]'::jsonb) from public.maintenance_history h)
  );
end; $$;
create function public.add_product_with_tasks(product_data jsonb, task_data jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.products select * from jsonb_populate_record(null::public.products, product_data);
  if exists (select 1 from jsonb_array_elements(task_data) t where t->>'productId' is distinct from product_data->>'id') then
    raise exception 'Task product mismatch';
  end if;
  insert into public.maintenance_tasks select * from jsonb_populate_recordset(null::public.maintenance_tasks, task_data);
end; $$;
create function public.complete_maintenance(task_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  t public.maintenance_tasks;
  completed date := (current_timestamp at time zone 'Asia/Tokyo')::date;
begin
  select * into t from public.maintenance_tasks where id = task_id for update;
  if not found then raise exception 'Task unavailable'; end if;
  -- Duplicate taps or retries on the same calendar day are harmless.
  insert into public.maintenance_history("taskId", "productId", "completedAt")
    values(t.id, t."productId", completed) on conflict ("taskId", "completedAt") do nothing;
  if found then
    update public.maintenance_tasks set "lastCompletedAt" = completed,
      "nextDueAt" = completed + "intervalDays" where id = task_id;
  end if;
end; $$;
revoke all on function public.load_household(), public.add_product_with_tasks(jsonb,jsonb), public.complete_maintenance(uuid) from public, anon;
grant execute on function public.load_household(), public.add_product_with_tasks(jsonb,jsonb), public.complete_maintenance(uuid) to authenticated;
