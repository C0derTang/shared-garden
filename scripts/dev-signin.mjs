// Development-only seeded local sign-in (decision 0067, issue #175).
//
// Usage (with `npx supabase start` running and `npm run dev` using the same
// local settings in .env.local):
//   npm run dev:signin -- --member 1     # or --member 2
//
// Seeds the two local garden slots with fake identities on the reserved
// example.test domain (member1@example.test, member2@example.test) when the
// local membership is empty, binds a fake Google identity to each unbound slot
// through the real garden_bind_google_identity trigger, then creates a local
// Auth session for the chosen slot and prints a short-lived link. Opening the
// link on the dev server (/auth/dev-sign-in) exchanges it for the session
// cookie. It only talks to this checkout's local Supabase containers and
// refuses unless NODE_ENV, APP_ORIGIN and both Supabase URLs are local
// development values. It never prints keys or local status output.
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

export const FAKE_EMAILS = ['member1@example.test', 'member2@example.test'];
export class DevSignInError extends Error {}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function parseArgs(argv) {
  let member;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = arg.startsWith('--member=') ? arg.slice(9) : arg === '--member' ? argv[++i] : undefined;
    if (value === undefined) throw new DevSignInError(`Unknown argument: ${arg}`);
    if (member !== undefined) throw new DevSignInError('Pass --member once.');
    member = value;
  }
  if (member !== '1' && member !== '2')
    throw new DevSignInError('Usage: npm run dev:signin -- --member 1|2');
  return { member: Number(member) };
}

/** An http loopback origin with nothing but scheme, host and port. */
export function loopbackOrigin(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    return null;
  }
  if (
    url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash
  )
    return null;
  return url.origin;
}

/** Every gate must pass before anything touches the database. */
export function checkEnvironment(env, status) {
  if (env.NODE_ENV !== undefined && env.NODE_ENV !== 'development')
    throw new DevSignInError('Refusing: NODE_ENV must be unset or development.');
  const appOrigin = loopbackOrigin(env.APP_ORIGIN);
  if (!appOrigin)
    throw new DevSignInError('Refusing: APP_ORIGIN must be an http loopback origin such as http://localhost:3000.');
  const supabaseUrl = loopbackOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!supabaseUrl)
    throw new DevSignInError('Refusing: NEXT_PUBLIC_SUPABASE_URL must be the local http loopback Supabase URL.');
  const localApi = loopbackOrigin(status?.API_URL);
  if (!localApi || localApi !== supabaseUrl)
    throw new DevSignInError('Refusing: NEXT_PUBLIC_SUPABASE_URL does not match the running local Supabase stack.');
  return { appOrigin };
}

/** The local database container for this checkout's supabase/config.toml. */
export function containerName(configToml) {
  const id = /^project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/m.exec(configToml)?.[1];
  if (!id) throw new DevSignInError('Refusing: no local project_id in supabase/config.toml.');
  return `supabase_db_${id}`;
}

export function newRefreshToken(pick = randomInt) {
  // Auth accepts legacy refresh tokens of 12 lowercase alphanumerics; Auth
  // rotates this one on first use.
  return Array.from({ length: 12 }, () => TOKEN_ALPHABET[pick(TOKEN_ALPHABET.length)]).join('');
}

// One transaction. psql variables (:'name') quote every supplied value.
export const SEED_SQL = `
begin;
-- Seed both slots with fake identities only when nothing is configured yet,
-- through the same privileged bootstrap used for real configuration.
set local role postgres;
select private.bootstrap_members(:'email1', :'email2')
  where not exists (select 1 from private.garden_members);
reset role;
-- Never touch a configuration that is not entirely fake local identities.
do $$ begin
  if (select count(*) from private.garden_members
      where allowed_email like '%@example.test' and revoked_at is null) <> 2 then
    raise exception 'Local membership is not two unrevoked example.test identities';
  end if;
end $$;
-- Create a verified fake Google account for each unbound slot. Inserting its
-- identity fires garden_bind_google_identity, exactly as a real first sign-in.
set local role supabase_auth_admin;
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, encrypted_password,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated', 'authenticated', m.allowed_email,
  '{"provider":"google","providers":["google"]}', '{}', now(), now(), '',
  '', '', '', ''
from private.garden_members m where m.user_id is null;
insert into auth.identities (user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at)
select u.id, 'dev-signin-' || u.id, 'google',
  jsonb_build_object('sub', 'dev-signin-' || u.id, 'email', m.allowed_email,
    'email_verified', true), now(), now(), now()
from private.garden_members m join auth.users u on u.email = m.allowed_email
where m.user_id is null;
-- Auth confirms an OAuth account after its identity is stored.
update auth.users u set email_confirmed_at = now()
from private.garden_members m
where u.email = m.allowed_email and u.email_confirmed_at is null;
reset role;
-- A session for the chosen slot only if it is bound exactly as access requires.
with target as (
  select m.user_id from private.garden_members m
  cross join lateral private.google_account(m.user_id, true) a
  where m.member_id = :'member'::smallint and m.revoked_at is null
    and m.allowed_email = a.email and m.google_subject = a.google_subject
), session as (
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  select gen_random_uuid(), user_id, now(), now(), 'aal1' from target
  returning id, user_id
), claim as (
  insert into auth.mfa_amr_claims (id, session_id, created_at, updated_at,
    authentication_method)
  select gen_random_uuid(), id, now(), now(), 'oauth' from session
), refresh as (
  insert into auth.refresh_tokens (instance_id, token, user_id, revoked,
    created_at, updated_at, session_id)
  select '00000000-0000-0000-0000-000000000000', :'token', user_id::text,
    false, now(), now(), id from session
  returning 1
)
select 'dev-signin-sessions:' || count(*) from refresh;
commit;
`;

export async function devSignIn({ argv, env, status, sql, pickToken = newRefreshToken, report }) {
  const { member } = parseArgs(argv);
  const { appOrigin } = checkEnvironment(env, status);
  const token = pickToken();
  const output = sql(SEED_SQL, {
    email1: FAKE_EMAILS[0],
    email2: FAKE_EMAILS[1],
    member: String(member),
    token,
  });
  if (!output.split('\n').includes('dev-signin-sessions:1'))
    throw new DevSignInError(`Member ${member} is not bound to a local fake identity.`);
  const link = `${appOrigin}/auth/dev-sign-in?token=${token}`;
  report(`Local member ${member} session ready. Open this link on the dev server:`);
  report(link);
  return link;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    // Read the same environment files `next dev` reads, without overriding
    // anything already exported in this shell.
    const { default: nextEnv } = await import('@next/env');
    nextEnv.loadEnvConfig(root, true, { info() {}, error() {} });
    let status;
    try {
      status = JSON.parse(
        execFileSync(path.join(root, 'node_modules/.bin/supabase'), ['status', '-o', 'json'], {
          cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
        }),
      );
    } catch {
      throw new DevSignInError('Local Supabase is not running. Start it with npx supabase start.');
    }
    const container = containerName(readFileSync(path.join(root, 'supabase/config.toml'), 'utf8'));
    await devSignIn({
      argv: process.argv.slice(2),
      env: process.env,
      status,
      report: (line) => console.log(line),
      sql: (input, vars) => {
        try {
          return execFileSync(
            'docker',
            ['exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres',
              '-v', 'ON_ERROR_STOP=1', '-qAt',
              ...Object.entries(vars).flatMap(([k, v]) => ['-v', `${k}=${v}`])],
            { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
          );
        } catch (error) {
          throw new DevSignInError(`Local seeding failed: ${String(error.stderr ?? '').trim() || 'database unavailable'}`);
        }
      },
    });
  } catch (error) {
    console.error(error instanceof DevSignInError ? error.message : 'Development sign-in failed.');
    process.exitCode = 1;
  }
}
