-- Real host <-> account relationship, replacing the single shared Host
-- password. A "host" is just an existing account (from `accounts`) that
-- other accounts can be linked to — many accounts can share one host.
--
-- Each row says "this member account has Host access, grouped under this
-- host account". member_username is the primary key, so an account can only
-- belong to one host at a time (reassigning is a plain upsert), and deleting
-- one row never touches any other account's row. A host is "Host of itself"
-- via a self-referencing row (host_username = member_username) — that's
-- what actually grants the host-designated account its own Host access.

create table if not exists host_accounts (
  member_username text primary key references accounts(username) on delete cascade,
  host_username    text not null references accounts(username) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists host_accounts_host_idx on host_accounts(host_username);

alter table host_accounts enable row level security;
drop policy if exists "public access host_accounts" on host_accounts;
create policy "public access host_accounts" on host_accounts for all using (true) with check (true);

-- Bootstrap: without at least one row, nobody could open the Host Dashboard
-- to grant anyone Host access in the first place. This makes the existing
-- "robin boktor" account the first Host (of itself) — everyone else is
-- linked to a host from the new "صلاحية الهوست" panel in the Accounts tab.
insert into host_accounts (member_username, host_username)
values ('robin boktor', 'robin boktor')
on conflict (member_username) do nothing;
