-- consumer_auth schema on pdo-db: email-only OTP accounts + sessions for
-- cts-ui. Applied by scripts/provision-auth-db.mjs as the NOLOGIN
-- `cts_ui_owner` role, which owns everything here. The `cts_ui_app` role this
-- app connects as gets only the row privileges lib/server/auth/otp.ts uses (TABLE_GRANTS
-- in that script) and nothing outside this schema.
create schema if not exists consumer_auth;

create table if not exists consumer_auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- One row per requested code. A row is consumed (consumed_at set) the first
-- time it verifies successfully; expired/consumed rows are left in place for
-- audit rather than deleted, and pruned separately.
create table if not exists consumer_auth.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists otp_codes_email_idx on consumer_auth.otp_codes (email, created_at desc);

create table if not exists consumer_auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references consumer_auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on consumer_auth.sessions (user_id);
