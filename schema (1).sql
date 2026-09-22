-- =====================================================================
-- MUZN Operations — Supabase schema
-- شغّل هذا الملف مرة واحدة كاملاً من: Supabase Dashboard → SQL Editor → New query
-- بعدها الصق Project URL و anon public key داخل التطبيق (شاشة تسجيل الدخول → ⚙️ ربط قاعدة بيانات)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) الجداول
-- ---------------------------------------------------------------------

create table if not exists public.company (
  id integer primary key default 1,
  name text not null default 'MUZN Operations',
  currency_symbol text not null default 'د.ك',
  currency_decimals integer not null default 3,
  week_day integer not null default 4,
  demo boolean not null default false,
  constraint company_single_row check (id = 1)
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  name text not null,
  role text not null default 'staff' check (role in ('admin','staff')),
  perms text[] not null default '{}',
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  active boolean not null default true,
  default_pw boolean not null default true,
  salt text not null,
  hash text not null
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text default 'كغ',
  cost numeric not null default 0,
  opening numeric not null default 0,
  min_stock numeric not null default 0
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text default 'حبة',
  cost numeric not null default 0,
  price numeric not null default 0,
  dist_price numeric not null default 0,
  opening numeric not null default 0,
  min_stock numeric not null default 0,
  material_id uuid references public.materials(id) on delete set null,
  material_qty numeric not null default 0
);

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table if not exists public.distributors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  period text not null default 'weekly' check (period in ('weekly','monthly'))
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  distributor_id uuid references public.distributors(id) on delete set null,
  terms integer not null default 14
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  terms integer not null default 0
);

-- ---- ورديات الإنتاج ----
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift text not null check (shift in ('Morning','Evening','Night')),
  operator_id uuid references public.operators(id) on delete set null,
  notes text default '',
  by text,
  ts bigint
);
create table if not exists public.shift_items (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  planned numeric not null default 0,
  actual numeric not null default 0,
  waste numeric not null default 0,
  down numeric not null default 0,
  reason text default '',
  log jsonb not null default '[]'
);

-- ---- المسحوبات ----
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  distributor_id uuid references public.distributors(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  qty numeric not null default 0,
  price numeric not null default 0,
  note text default '',
  by text,
  ts bigint,
  log jsonb not null default '[]'
);

-- ---- المبيعات ----
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  distributor_id uuid references public.distributors(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  type text not null check (type in ('cash','credit')),
  by text,
  ts bigint
);
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  qty numeric not null default 0,
  price numeric not null default 0,
  discount numeric not null default 0,
  cost numeric not null default 0,
  log jsonb not null default '[]'
);

-- ---- المشتريات ----
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  payment text not null check (payment in ('cash','credit')),
  by text,
  ts bigint
);
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  item text not null,
  product_id uuid references public.products(id) on delete set null,
  material_id uuid references public.materials(id) on delete set null,
  qty numeric not null default 0,
  unit_cost numeric not null default 0,
  log jsonb not null default '[]'
);

-- ---- التحصيل والذمم ----
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  customer_id uuid references public.customers(id) on delete set null,
  amount numeric not null default 0,
  channel text check (channel in ('bank','cash','pos')),
  distributor_id uuid references public.distributors(id) on delete set null,
  by text,
  ts bigint
);

-- ---- إيصالات استلام من الموزعين ----
create table if not exists public.remittances (
  id uuid primary key default gen_random_uuid(),
  no text,
  date date not null,
  distributor_id uuid references public.distributors(id) on delete set null,
  amount numeric not null default 0,
  method text check (method in ('cash','bank')),
  note text default '',
  by text,
  ts bigint
);

-- ---- تسديدات للموردين ----
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  amount numeric not null default 0,
  method text check (method in ('cash','bank')),
  note text default '',
  by text,
  ts bigint
);

-- ---- تنبيهات / طلبات ----
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text,
  target_id uuid,
  title text,
  body text,
  items jsonb default '[]',
  by text,
  ts bigint,
  done boolean not null default false
);

-- ---- سجل التعديلات ----
create table if not exists public.audit (
  id uuid primary key default gen_random_uuid(),
  ts bigint,
  by text,
  act text,
  text text
);

-- ---------------------------------------------------------------------
-- 2) عرض عام للمستخدمين (بدون salt/hash) — هذا ما يقرأه التطبيق مباشرة
-- ---------------------------------------------------------------------
create or replace view public.users_public as
  select id, username, name, role, perms, can_edit, can_delete, active, default_pw
  from public.users;

-- ---------------------------------------------------------------------
-- 3) دوال تسجيل الدخول وإدارة المستخدمين (SECURITY DEFINER)
--    هذه الدوال فقط تلمس عمودي salt/hash — الجدول نفسه غير متاح مباشرة لمفتاح anon
-- ---------------------------------------------------------------------

create or replace function public.app_login(p_username text, p_password text)
returns table(id uuid, username text, name text, role text, perms text[], can_edit boolean, can_delete boolean, active boolean, default_pw boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.users%rowtype;
begin
  select * into u from public.users
    where public.users.username = lower(trim(p_username)) and public.users.active = true
    limit 1;
  if not found then
    return;
  end if;
  if u.hash = encode(digest(u.salt || '|' || p_password, 'sha256'), 'hex') then
    return query select u.id, u.username, u.name, u.role, u.perms, u.can_edit, u.can_delete, u.active, u.default_pw;
  end if;
  return;
end;
$$;

create or replace function public.app_set_password(p_id uuid, p_current text, p_new text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.users%rowtype;
  new_salt text;
begin
  select * into u from public.users where public.users.id = p_id;
  if not found then
    return false;
  end if;
  if u.hash <> encode(digest(u.salt || '|' || p_current, 'sha256'), 'hex') then
    return false;
  end if;
  new_salt := gen_random_uuid()::text;
  update public.users set
    salt = new_salt,
    hash = encode(digest(new_salt || '|' || p_new, 'sha256'), 'hex'),
    default_pw = false
  where public.users.id = p_id;
  return true;
end;
$$;

create or replace function public.app_upsert_user(
  p_id uuid, p_name text, p_username text, p_password text, p_role text,
  p_perms text[], p_can_edit boolean, p_can_delete boolean, p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  new_salt text;
begin
  if p_id is null then
    new_id := gen_random_uuid();
    new_salt := gen_random_uuid()::text;
    insert into public.users (id, username, name, role, perms, can_edit, can_delete, active, default_pw, salt, hash)
    values (new_id, lower(trim(p_username)), p_name, p_role, coalesce(p_perms,'{}'), coalesce(p_can_edit,false),
            coalesce(p_can_delete,false), coalesce(p_active,true), true,
            new_salt, encode(digest(new_salt || '|' || coalesce(p_password,''), 'sha256'), 'hex'));
    return new_id;
  else
    update public.users set
      name = p_name,
      username = lower(trim(p_username)),
      role = p_role,
      perms = coalesce(p_perms,'{}'),
      can_edit = coalesce(p_can_edit,false),
      can_delete = coalesce(p_can_delete,false),
      active = coalesce(p_active,true)
    where public.users.id = p_id;
    if p_password is not null and length(p_password) > 0 then
      new_salt := gen_random_uuid()::text;
      update public.users set
        salt = new_salt,
        hash = encode(digest(new_salt || '|' || p_password, 'sha256'), 'hex'),
        default_pw = false
      where public.users.id = p_id;
    end if;
    return p_id;
  end if;
end;
$$;

create or replace function public.app_delete_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.users where public.users.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) الصلاحيات (RLS)
--    كل جداول البيانات مفتوحة لمفتاح anon (فريق واحد موثوق يستخدم نفس المشروع).
--    جدول users محمي: لا وصول مباشر إلا عبر الدوال أعلاه أو عرض users_public.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'company','materials','products','operators','distributors','customers','suppliers',
    'shifts','shift_items','withdrawals','sales','sale_items','purchases','purchase_items',
    'payments','remittances','supplier_payments','notices','audit'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "allow all" on public.%I', t);
    execute format('create policy "allow all" on public.%I for all using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- جدول users: تفعيل RLS بدون منح مباشر لعمودي salt/hash؛
-- نسمح فقط بقراءة الأعمدة العامة (تُستخدم في تفعيل تحديثات Realtime الفورية)
alter table public.users enable row level security;
drop policy if exists "allow all" on public.users;
create policy "allow all" on public.users for all using (true) with check (true);
grant select (id, username, name, role, perms, can_edit, can_delete, active, default_pw) on public.users to anon, authenticated;

grant select on public.users_public to anon, authenticated;
grant execute on function public.app_login(text, text) to anon, authenticated;
grant execute on function public.app_set_password(uuid, text, text) to anon, authenticated;
grant execute on function public.app_upsert_user(uuid, text, text, text, text, text[], boolean, boolean, boolean) to anon, authenticated;
grant execute on function public.app_delete_user(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) تفعيل التحديثات الفورية (Realtime) على كل الجداول التي يراقبها التطبيق
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'company','users','materials','products','operators','distributors','customers','suppliers',
    'shifts','shift_items','withdrawals','sales','sale_items','purchases','purchase_items',
    'payments','remittances','supplier_payments','notices','audit'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- الجدول مضاف مسبقاً للنشر، تجاهل
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6) بيانات أولية: صف الشركة + حساب مدير افتراضي (admin / admin123)
--    غيّر كلمة مرور المدير فور أول تسجيل دخول من: الإدارة ← المستخدمون
-- ---------------------------------------------------------------------
insert into public.company (id, name, currency_symbol, currency_decimals, week_day, demo)
values (1, 'MUZN Operations', 'د.ك', 3, 4, false)
on conflict (id) do nothing;

do $$
declare
  s text;
begin
  if not exists (select 1 from public.users where username = 'admin') then
    s := gen_random_uuid()::text;
    insert into public.users (username, name, role, perms, can_edit, can_delete, active, default_pw, salt, hash)
    values ('admin', 'مدير النظام', 'admin', '{}', true, true, true, true, s, encode(digest(s || '|' || 'admin123', 'sha256'), 'hex'));
  end if;
end $$;

-- =====================================================================
-- انتهى. الخطوات التالية:
-- 1) Project Settings → API → انسخ Project URL و anon public key.
-- 2) في التطبيق: شاشة الدخول ← ⚙️ (بجانب اسم الشركة) ← ربط قاعدة بيانات مشتركة ← الصق القيمتين واحفظ.
-- 3) سجّل الدخول بـ admin / admin123 ثم غيّر كلمة المرور فوراً من الإدارة.
-- =====================================================================
