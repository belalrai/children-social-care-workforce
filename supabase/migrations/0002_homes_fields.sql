-- Align homes with the fields in the exported AI Studio UI. Additive only.
alter table public.homes
  add column if not exists address_line_1 text,
  add column if not exists city text,
  add column if not exists county text,
  add column if not exists postcode text,
  add column if not exists registered_manager_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists max_occupancy int check (max_occupancy is null or max_occupancy > 0),
  add column if not exists status text not null default 'active' check (status in ('active','inactive'));
create unique index if not exists homes_ofsted_urn_uq on public.homes (ofsted_urn) where ofsted_urn is not null;
-- Optional synthetic demo homes (from the AI Studio export). Run only on development projects.
insert into public.homes (name,address_line_1,city,county,postcode,ofsted_urn,registered_manager_name,contact_phone,contact_email,max_occupancy,is_demo)
values ('Foxglove Children''s Home','14 Meadowcroft Lane','Chelmsford','Essex','CM2 8RT','SC-DEMO-001','Sarah Jenkins','01245 550192','foxglove@careworkforce.org.uk',4,true),
       ('Canvey Rise Children''s Home','88 Seaview Avenue','Canvey Island','Essex','SS8 7PR','SC-DEMO-002','Marcus Vance','01268 550841','canvey@careworkforce.org.uk',3,true)
on conflict do nothing;
