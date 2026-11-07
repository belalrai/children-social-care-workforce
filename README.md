# Children's Social Care Workforce Management System
Phase 1 (secure foundation). Synthetic data only until security review and owner sign-off.

## Setup
1. `npm install`
2. Create a **development** Supabase project. Auth > Providers > Email: **disable sign-ups**.
3. Run `supabase/migrations/0001`, `0002` and `0003` and `0004` (in order) in the SQL editor (or `supabase db push`).
4. Create your admin user in Auth > Users, then in the SQL editor:
   `insert into profiles(id) values ('<user-uuid>'); insert into user_roles select '<user-uuid>', id from roles where name='admin';`
5. `cp .env.example .env`, fill in URL and anon key (never service_role).
6. `npm run dev`, then `npm run build`.

## Not yet built
Interview scheduling and structured assessments, screening forms, CV upload, onboarding checks, compliance, restricted cases, reporting), Storage buckets,
Edge Function for user admin, MFA, RLS test suite, backups. Non-admin roles are seeded but have no policies (deny by default).
