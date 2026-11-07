-- Phase 1: secure foundation. Deny-by-default RLS; Admin-only access initially.
create extension if not exists pgcrypto;

create table public.roles (id uuid primary key default gen_random_uuid(), name text unique not null);
insert into public.roles(name) values ('admin'),('hr_administrator'),('registered_manager'),
 ('senior_management'),('safeguarding_lead'),('readonly_auditor');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, is_active boolean not null default true, created_at timestamptz not null default now());
create table public.user_roles (
  user_id uuid references public.profiles(id) on delete cascade,
  role_id uuid references public.roles(id), primary key (user_id, role_id));

create table public.homes (
  id uuid primary key default gen_random_uuid(), name text not null, address text,
  ofsted_urn text, is_demo boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  first_name text not null, last_name text not null, email text, job_title text,
  status text not null default 'onboarding' check (status in ('onboarding','active','leaver')),
  start_date date, is_demo boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index employees_email_uq on public.employees (lower(email)) where email is not null;

create table public.employee_home_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  home_id uuid not null references public.homes(id),
  role_title text, start_date date not null default current_date, end_date date,
  unique (employee_id, home_id, start_date));
create index on public.employee_home_assignments (home_id);

create table public.vacancies (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id), title text not null, description text,
  employment_type text, hours_per_week numeric, salary_min numeric, salary_max numeric,
  positions int not null default 1, owner_id uuid references public.profiles(id),
  status text not null default 'draft' check (status in ('draft','open','on_hold','filled','closed')),
  opens_on date, closes_on date, created_at timestamptz not null default now());

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid references public.vacancies(id),
  first_name text not null, last_name text not null, email text,
  stage text not null default 'new_candidate' check (stage in ('new_candidate','cv_screening','shortlisted',
   'interview_scheduled','interview_completed','references_suitability_review','conditional_offer','hired',
   'rejected','withdrawn','on_hold')),
  employee_id uuid references public.employees(id),
  created_at timestamptz not null default now());

create table public.audit_logs (
  id bigint generated always as identity primary key, actor uuid default auth.uid(),
  action text not null, table_name text not null, record_id text,
  old_data jsonb, new_data jsonb, created_at timestamptz not null default now());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
    join profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and r.name = 'admin' and p.is_active) $$;

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(action, table_name, record_id, old_data, new_data)
  values (tg_op, tg_table_name,
    coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id')),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['profiles','user_roles','homes','employees','employee_home_assignments','vacancies','candidates'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
  foreach t in array array['roles','profiles','user_roles','homes','employees','employee_home_assignments','vacancies','candidates','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  foreach t in array array['roles','user_roles','homes','employees','employee_home_assignments','vacancies','candidates'] loop
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

create policy profiles_self_or_admin on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());
-- Audit log is append-only: no insert/update/delete policy, and privileges revoked.
revoke insert, update, delete on public.audit_logs from authenticated;
revoke execute on function public.is_admin() from anon;
