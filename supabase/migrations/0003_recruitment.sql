-- Phase 2: recruitment / ATS. Additive. Admin-only RLS, audited.
alter table public.candidates
  add column if not exists phone text, add column if not exists source text,
  add column if not exists applied_on date not null default current_date,
  add column if not exists offer_made_on date, add column if not exists offer_accepted_on date,
  add column if not exists offer_conditions text default 'Conditional on satisfactory safer recruitment checks. Not authorisation to start.';

create table public.candidate_stage_history (
  id bigint generated always as identity primary key,
  candidate_id uuid not null references public.candidates(id),
  from_stage text, to_stage text not null, changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now());

create table public.candidate_references (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id),
  referee_name text not null, employer text, referee_contact text,
  requested_on date, received_on date, verified_on date, verified_by uuid references public.profiles(id),
  concerns text,
  outcome text not null default 'pending' check (outcome in ('pending','satisfactory','concerns')),
  created_at timestamptz not null default now());
create index on public.candidate_references (candidate_id);

create or replace function public.log_stage() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or new.stage is distinct from old.stage then
    insert into candidate_stage_history(candidate_id, from_stage, to_stage)
    values (new.id, case when tg_op='UPDATE' then old.stage end, new.stage);
  end if; return new; end $$;
create trigger candidates_stage_log after insert or update on public.candidates for each row execute function public.log_stage();

-- 'hired' may only be reached through conversion (needs a linked employee).
create or replace function public.guard_hired() returns trigger language plpgsql as $$
begin
  if new.stage='hired' and new.employee_id is null then raise exception 'Use candidate conversion to reach Hired'; end if;
  return new; end $$;
create trigger candidates_guard_hired before insert or update on public.candidates for each row execute function public.guard_hired();

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
  return emp;
end $$;
revoke execute on function public.convert_candidate_to_employee(uuid) from public, anon;
grant execute on function public.convert_candidate_to_employee(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['candidate_stage_history','candidate_references'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  create policy admin_all on public.candidate_references for all to authenticated using (public.is_admin()) with check (public.is_admin());
  create policy admin_read on public.candidate_stage_history for select to authenticated using (public.is_admin());
  revoke insert, update, delete on public.candidate_stage_history from authenticated;
  create trigger audit_candidate_references after insert or update or delete on public.candidate_references for each row execute function public.audit_row();
end $$;
