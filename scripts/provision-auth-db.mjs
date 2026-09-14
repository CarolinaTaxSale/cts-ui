// `npm run provision-auth-db` - set up this app's own schemas on the `pdo-db`
// Postgres (Fly.io), plus the least-privilege role this app connects as:
//
//   consumer_auth  email-OTP sign-in (migrations/0001)
//   consumer_app   what signed-in users keep - saved parcels, lists, notes (0002)
//
// This deliberately does NOT reuse the orchestrator's `etl_writer` or
// `consumer_reader` roles (see all-in-one's scripts/consumer-db.mjs): this is
// a public-internet-facing web app, and it has no business holding a
// credential that can write to the `parcels` schema, or that the ETL job's
// credential rotation would need to account for. Nor does consumer_reader get
// to write here: anyone who can insert into consumer_auth.sessions can sign in
// as any user.
//
// Two roles, so even a compromised app can't reshape or wipe its own tables:
//
//   cts_ui_owner  NOLOGIN - owns both schemas and their tables. The
//                 migrations run as this role.
//   cts_ui_app    LOGIN - USAGE on both schemas plus only the row privileges
//                 lib/server/auth/otp.ts and lib/server/library.ts use
//                 (TABLE_GRANTS below). No DDL, no TRUNCATE, nothing in parcels.
//
// Every file in migrations/ runs, in name order, on every provision, so each
// one must be idempotent (`if not exists`).
//
// Idempotent, same pattern as consumer-db.mjs: creates whatever is missing and
// re-asserts the rest, including revoking any table privilege that isn't in
// TABLE_GRANTS. Credentials are a random 256-bit password, kept in the
// gitignored `.env.auth-db` at this repo's root (`--rotate` issues a new one).
// Only a SCRAM-SHA-256 verifier - never the password itself - is sent to the
// server. Requires `fly` (authenticated against the pdo-db org) and `docker`
// on PATH.
import { spawnSync } from "node:child_process";
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const APP = process.env.CONSUMER_DB_APP ?? "pdo-db";
const HOST = process.env.CONSUMER_DB_HOST ?? `${APP}.fly.dev`;
// libpq 17+ offers TLS ALPN, which Fly's pg_tls edge rejects - see
// all-in-one's consumer-db.mjs for the full explanation.
const PSQL_IMAGE = "postgres:16-alpine";
const DATABASE = "carolinataxsale";
const SSLMODE = "verify-full";
const SCHEMAS = ["consumer_auth", "consumer_app"];
const OWNER = "cts_ui_owner";
const ROLE = "cts_ui_app";
const CREDENTIALS_FILE = resolve(root, ".env.auth-db");
const MIGRATIONS_DIR = resolve(root, "migrations");

// Exactly what the app's queries do to each table. A new table or a new kind of
// query needs its grant added here; the end-of-run check fails until it is.
export const TABLE_GRANTS = {
  // lib/server/auth/otp.ts
  // insert a code; select ... for update, then bump attempt_count / set consumed_at
  "consumer_auth.otp_codes": ["SELECT", "INSERT", "UPDATE"],
  // insert ... on conflict (email) do update ... returning id
  "consumer_auth.users": ["SELECT", "INSERT", "UPDATE"],
  // create on sign-in, look up per request, delete on sign-out
  "consumer_auth.sessions": ["SELECT", "INSERT", "DELETE"],

  // lib/server/library.ts
  // list; save (insert ... on conflict do nothing); unsave
  "consumer_app.saved_parcels": ["SELECT", "INSERT", "DELETE"],
  // list; create; rename; delete
  "consumer_app.parcel_lists": ["SELECT", "INSERT", "UPDATE", "DELETE"],
  // list; add (insert ... on conflict do nothing); remove
  "consumer_app.parcel_list_items": ["SELECT", "INSERT", "DELETE"],
  // read; write (insert ... on conflict do update); clear
  "consumer_app.parcel_notes": ["SELECT", "INSERT", "UPDATE", "DELETE"],
};
const TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];

const step = (message) => console.log(`\n==> ${message}`);
const urlFor = (password) => `postgres://${ROLE}:${password}@${HOST}:5432/${DATABASE}?sslmode=${SSLMODE}`;

/** The SCRAM-SHA-256 verifier Postgres stores for `password` (RFC 5802/7677, 4096 iterations like the server default). */
function scramVerifier(password) {
  const iterations = 4096;
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const hmac = (key, text) => createHmac("sha256", key).update(text).digest();
  const storedKey = createHash("sha256").update(hmac(salted, "Client Key")).digest();
  const serverKey = hmac(salted, "Server Key");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Write via a temp file + rename, so a crash can't leave a half-written credentials file. */
function writeAtomic(path, text) {
  writeFileSync(`${path}.tmp`, text, { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

function run(cmd, args, { input, env } = {}) {
  const res = spawnSync(cmd, args, { cwd: root, input, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw new Error(`Couldn't run ${cmd} (${res.error.message}). Is it installed and on your PATH?`);
  return res;
}

// psql's own exit status, echoed after it finishes - fly.exe's exit code isn't
// reliable here (on Windows it can fail on its console handle after a clean run).
const EXIT_MARKER = "__psql_exit=";

/** Run a psql script as the Fly `postgres` superuser, inside the machine. Throws on the first failed statement. */
function adminPsql(sql) {
  const remote = `sh -c "PGPASSWORD=\\"$OPERATOR_PASSWORD\\" psql -qAtX -v ON_ERROR_STOP=1 -h localhost -U postgres -d postgres; echo ${EXIT_MARKER}$?"`;
  const res = run("fly", ["ssh", "console", "--app", APP, "--command", remote], { input: sql });
  const code = res.stdout.match(new RegExp(`${EXIT_MARKER}(\\d+)`))?.[1];
  if (code !== "0") {
    const detail = `${res.stdout}\n${res.stderr}`.replace(new RegExp(`${EXIT_MARKER}\\d+`), "").trim();
    throw new Error(`psql on ${APP} ${code ? `exited ${code}` : "never ran"}:\n${detail}`);
  }
}

/** Log in as `role` over the public endpoint and run `sql`. Returns stdout. */
function loginPsql(password, sql) {
  const conninfo = `host=${HOST} port=5432 user=${ROLE} dbname=${DATABASE} sslmode=${SSLMODE} sslrootcert=system connect_timeout=20`;
  // `-e PGPASSWORD` with no value hands docker the variable from our own
  // environment, so the password never appears on a command line.
  const res = run("docker", ["run", "--rm", "-i", "-e", "PGPASSWORD", PSQL_IMAGE, "psql", conninfo, "-qAtX", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    env: { ...process.env, PGPASSWORD: password },
  });
  if (res.status !== 0) throw new Error(`Logging in as ${ROLE} failed:\n${(res.stderr || res.stdout).trim()}`);
  return res.stdout.trim();
}

/** Every migration, in name order, as one script. */
export function readMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => `-- ${f}\n${readFileSync(resolve(MIGRATIONS_DIR, f), "utf8")}`)
    .join("\n");
}

const schemaList = SCHEMAS.map((s) => `'${s}'`).join(", ");

export function provisionSql(verifier, migrationSql) {
  const grants = Object.entries(TABLE_GRANTS)
    .map(([table, privileges]) => `GRANT ${privileges.join(", ")} ON ${table} TO ${ROLE};`)
    .join("\n");
  const perSchema = (render) => SCHEMAS.map(render).join("\n");
  return `
SELECT 'CREATE ROLE ${OWNER}' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${OWNER}') \\gexec
ALTER ROLE ${OWNER} WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
SELECT 'CREATE ROLE ${ROLE}' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') \\gexec
ALTER ROLE ${ROLE} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 10 PASSWORD '${verifier}';
GRANT CONNECT ON DATABASE ${DATABASE} TO ${ROLE};

\\connect ${DATABASE}
BEGIN;
${perSchema((schema) => `CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION ${OWNER};\nALTER SCHEMA ${schema} OWNER TO ${OWNER};`)}
-- Every table belongs to ${OWNER}, however it was created.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN (${schemaList}) LOOP
    EXECUTE format('ALTER TABLE %I.%I OWNER TO ${OWNER}', t.schemaname, t.tablename);
  END LOOP;
END $$;
-- CREATE SCHEMA IF NOT EXISTS checks the database's CREATE privilege before it
-- checks whether the schema exists, so the migration's own create-schema line
-- needs it. Granted only for this transaction: revoked again before COMMIT.
GRANT CREATE ON DATABASE ${DATABASE} TO ${OWNER};
SET ROLE ${OWNER};
${migrationSql}
RESET ROLE;
REVOKE CREATE ON DATABASE ${DATABASE} FROM ${OWNER};
${perSchema((schema) => `REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC, ${ROLE};\nGRANT USAGE ON SCHEMA ${schema} TO ${ROLE};\nREVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM PUBLIC, ${ROLE};`)}
${grants}
COMMIT;
`;
}

// One line of facts about the role, then one `schema.table:privileges` line per
// table in the schemas - so a table missing from TABLE_GRANTS shows up as a
// mismatch.
export const CHECK_SQL = `
SELECT 'user=' || current_user
    ${SCHEMAS.map((s) => `|| ' create-in-${s}=' || has_schema_privilege('${s}', 'CREATE')`).join("\n    ")}
    || ' parcels-usage=' || has_schema_privilege('parcels', 'USAGE')
    || ' member-of-${OWNER}=' || pg_has_role('${OWNER}', 'MEMBER');
SELECT n.nspname || '.' || c.relname || ':' || concat_ws(',', ${TABLE_PRIVILEGES.map(
  (p) => `CASE WHEN has_table_privilege(c.oid, '${p}') THEN '${p}' END`,
).join(", ")})
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN (${schemaList}) AND c.relkind IN ('r', 'p')
 ORDER BY n.nspname, c.relname;
`;

export function expectedCheck() {
  return [
    `user=${ROLE}${SCHEMAS.map((s) => ` create-in-${s}=false`).join("")} parcels-usage=false member-of-${OWNER}=false`,
    ...Object.keys(TABLE_GRANTS)
      .sort()
      .map((table) => `${table}:${TABLE_PRIVILEGES.filter((p) => TABLE_GRANTS[table].includes(p)).join(",")}`),
  ];
}

function main() {
  const args = process.argv.slice(2);
  for (const a of args) {
    if (a !== "--rotate") throw new Error(`Unknown option ${a}. Usage: npm run provision-auth-db [-- --rotate]`);
  }
  const rotate = args.includes("--rotate");

  step(`Credentials (${CREDENTIALS_FILE})`);
  const existing = readEnvFile(CREDENTIALS_FILE);
  let reused;
  try {
    reused = existing.AUTH_DB_URL ? decodeURIComponent(new URL(existing.AUTH_DB_URL).password) : undefined;
  } catch {
    reused = undefined;
  }
  const password = !rotate && reused ? reused : randomBytes(32).toString("base64url");
  console.log(`    ${ROLE}: ${!rotate && reused ? "reusing saved password" : "new password"}`);

  // Saved before the server is touched: if anything below fails, a rerun
  // reuses this same password and converges, instead of locking the role out.
  writeAtomic(
    CREDENTIALS_FILE,
    [
      `# Written by \`npm run provision-auth-db\` - login for the Fly.io consumer DB (${APP}), consumer_auth schema. Never commit this file.`,
      `AUTH_DB_URL=${urlFor(password)}`,
      "",
    ].join("\n"),
  );

  step(`Provisioning roles, schema, tables and grants on ${APP} (as the Fly superuser, via fly ssh console)`);
  adminPsql(provisionSql(scramVerifier(password), readMigrations()));
  console.log("    done");

  step(`Checking ${ROLE}'s privileges over the public endpoint (${HOST}:5432, sslmode=${SSLMODE})`);
  const actual = loginPsql(password, CHECK_SQL).split(/\r?\n/);
  for (const line of actual) console.log(`    ${line}`);
  const expected = expectedCheck();
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(`${ROLE} doesn't have exactly the privileges it should. Expected:\n${expected.map((l) => `    ${l}`).join("\n")}`);
  }

  console.log(`
Done. AUTH_DB_URL is in ${CREDENTIALS_FILE}.
Copy it into this repo's .env as AUTH_DB_URL for \`pnpm dev\`, and into all-in-one's
root .env as CTS_UI_AUTH_DB_URL for the compose stack (then \`docker compose up -d cts-ui\`).`);
}

export { scramVerifier };

// Only when run as a script: importing this file (to try the SQL against a
// local Postgres) provisions nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exit(1);
  }
}
