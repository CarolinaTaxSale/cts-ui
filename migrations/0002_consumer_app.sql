-- consumer_app schema on pdo-db: what signed-in users keep in cts-ui - the
-- parcels they save, the lists they sort them into, and their notes. Applied
-- by scripts/provision-auth-db.mjs as the NOLOGIN `cts_ui_owner` role, like
-- 0001. The `cts_ui_app` role gets only the row privileges
-- lib/server/saved.ts uses (TABLE_GRANTS in that script).
--
-- Parcels are named by (county_id, parcel_id), the county's own identifiers,
-- not parcels.meta's parcel_uuid: the etl job rebuilds the parcels schema per
-- county, and a user's saves have to outlive that. There are no foreign keys
-- into parcels for the same reason, and because this app's role can't read it.
create schema if not exists consumer_app;

-- The heart. A parcel is saved once per user, whatever lists it's in.
create table if not exists consumer_app.saved_parcels (
  user_id uuid not null references consumer_auth.users (id) on delete cascade,
  county_id text not null,
  parcel_id text not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, county_id, parcel_id)
);
create index if not exists saved_parcels_user_saved_at_idx on consumer_app.saved_parcels (user_id, saved_at desc);

-- A user's named lists ("Redemptions", "Acquisitions", ...).
create table if not exists consumer_app.parcel_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references consumer_auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  -- The target of parcel_list_items' composite foreign key, which keeps an
  -- item's list and saved parcel belonging to the same user.
  unique (id, user_id)
);
create unique index if not exists parcel_lists_user_name_idx on consumer_app.parcel_lists (user_id, lower(btrim(name)));

-- A saved parcel's place in a list. Only a saved parcel can be listed:
-- unsaving it takes it out of every list, and deleting a list leaves its
-- parcels saved.
create table if not exists consumer_app.parcel_list_items (
  list_id uuid not null,
  user_id uuid not null,
  county_id text not null,
  parcel_id text not null,
  added_at timestamptz not null default now(),
  primary key (list_id, county_id, parcel_id),
  foreign key (list_id, user_id) references consumer_app.parcel_lists (id, user_id) on delete cascade,
  foreign key (user_id, county_id, parcel_id) references consumer_app.saved_parcels (user_id, county_id, parcel_id) on delete cascade
);
create index if not exists parcel_list_items_parcel_idx on consumer_app.parcel_list_items (user_id, county_id, parcel_id);

-- One private note per user per parcel. Independent of saving: unsaving a
-- parcel keeps its note.
create table if not exists consumer_app.parcel_notes (
  user_id uuid not null references consumer_auth.users (id) on delete cascade,
  county_id text not null,
  parcel_id text not null,
  body text not null check (length(body) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, county_id, parcel_id)
);
