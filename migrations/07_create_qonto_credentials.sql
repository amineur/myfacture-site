create table if not exists qonto_credentials (
  id uuid default gen_random_uuid() primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  company_id uuid references companies(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table qonto_credentials enable row level security;

create policy "Enable all access for authenticated users"
on qonto_credentials
for all
to authenticated
using (true)
with check (true);
