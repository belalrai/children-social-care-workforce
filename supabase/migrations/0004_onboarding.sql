-- Phase 3: onboarding & safer recruitment. Additive. Admin-only RLS, audited.
create table public.onboarding_cases (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id),
  candidate_id uuid references public.candidates(id),
  status text not null default 'in_progress' check (status in ('in_progress','suitability_decided')),
  created_at timestamptz not null default now());

create table public.onboarding_checks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.onboarding_cases(id),
  check_type text not null check (check_type in ('identity','rtw','dbs','dbs_update','references','employment_history',
    'qualifications','contract_jd','appointment_docs','induction')),
  owner_id uuid references public.profiles(id), due_date date,
  -- evidence_received is NOT verified: only a named checker, date and method makes verified.
  status text not null default 'not_started' check (status in ('not_started','in_progress','evidence_received','verified','not_applicable')),
  method text, outcome text check (outcome in ('satisfactory','concerns') or outcome is null),
  checked_by uuid references public.profiles(id), checked_on date,
  evidence_ref text,            -- minimised identifier only (e.g. last 4 characters)
  consent_given boolean, certificate_match boolean, original_seen boolean,
  follow_up_date date, notes text,
  updated_at timestamptz not null default now(),
  unique (case_id, check_type),
  check (status <> 'verified' or (checked_by is not null and checked_on is not null and method is not null and outcome is not null)),
  check (status <> 'not_applicable' or notes is not null));
create index on public.onboarding_checks (case_id);

create table public.suitability_reviews (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.onboarding_cases(id),
  decision text not null check (decision in ('approved','not_approved','further_review')),
  rationale text not null check (length(trim(rationale)) > 0),
  concerns text, decided_by uuid not null default auth.uid() references public.profiles(id),
  decided_on timestamptz not null default now());

create or replace function public.create_onboarding_case(p_employee uuid, p_candidate uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid; t text;
begin
  if not is_admin() then raise exception 'Not authorised'; end if;
  select id into cid from onboarding_cases where employee_id=p_employee;
  if cid is not null then return cid; end if;
  insert into onboarding_cases(employee_id, candidate_id) values (p_employee, p_candidate) returning id into cid;
  foreach t in array array['identity','rtw','dbs','dbs_update','references','employment_history','qualifications','contract_jd','appointment_docs','induction'] loop
    insert into onboarding_checks(case_id, check_type) values (cid, t);
  end loop;
  return cid;
end $$;
revoke execute on function public.create_onboarding_case(uuid, uuid) from public, anon;
grant execute on function public.create_onboarding_case(uuid, uuid) to authenticated;

-- Conversion now also opens the onboarding case (candidate history is kept via candidate_id).
create or replace function public.convert_candidate_to_employee(p_candidate uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare c candidates%rowtype; emp uuid;
begin
  if not is_admin() then raise exception 'Not authorised'; end if;
  select * into c from candidates where id=p_candidate for update;
  if not found then raise exception 'Candidate not found'; end if;
  if c.employee_id is not null then return c.employee_id; end if;
  if c.stage <> 'conditional_offer' or c.offer_accepted_on is null then
    raise exception 'Conversion needs a conditional offer that has been accepted'; end if;
  if c.email is not null then select id into emp from employees where lower(email)=lower(c.email); end if;
  if emp is null then
    insert into employees(first_name,last_name,email,status) values (c.first_name,c.last_name,c.email,'onboarding') returning id into emp;
  end if;
  update candidates set employee_id=emp, stage='hired' where id=p_candidate;
  perform create_onboarding_case(emp, p_candidate);
  return emp;
end $$;

do $$ declare t text; begin
  foreach t in array array['onboarding_cases','onboarding_checks','suitability_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
  -- Suitability decisions are a permanent record: no edits or deletes.
  drop policy admin_all on public.suitability_reviews;
  create policy admin_read on public.suitability_reviews for select to authenticated using (public.is_admin());
  create policy admin_insert on public.suitability_reviews for insert to authenticated with check (public.is_admin());
end $$;
