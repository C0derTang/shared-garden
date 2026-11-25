import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DevSignInError, FAKE_EMAILS, SEED_SQL, checkEnvironment, containerName,
  devSignIn, loopbackOrigin, newRefreshToken, parseArgs,
} from './dev-signin.mjs';

const status = { API_URL: 'http://127.0.0.1:56321' };
const env = {
  APP_ORIGIN: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56321',
};
const refused = (fn) => assert.throws(fn, DevSignInError);

test('requires exactly one member slot, 1 or 2', () => {
  assert.deepEqual(parseArgs(['--member', '1']), { member: 1 });
  assert.deepEqual(parseArgs(['--member=2']), { member: 2 });
  for (const argv of [[], ['--member'], ['--member', '3'], ['--member', '0'],
    ['--member', '1', '--member', '2'], ['--email', 'a@example.test'], ['1']])
    refused(() => parseArgs(argv));
});

test('accepts only plain http loopback origins', () => {
  assert.equal(loopbackOrigin('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(loopbackOrigin('http://127.0.0.1:3105/'), 'http://127.0.0.1:3105');
  assert.equal(loopbackOrigin('http://[::1]:3000'), 'http://[::1]:3000');
  for (const value of [undefined, '', 'not a url', 'https://localhost:3000',
    'http://app.example.test', 'https://app.example.test', 'http://localhost.example.test',
    'http://10.0.0.2:3000', 'http://user:pw@localhost:3000', 'http://localhost:3000/path',
    'http://localhost:3000/?q=1', 'http://localhost:3000/#x'])
    assert.equal(loopbackOrigin(value), null, String(value));
});

test('gate: NODE_ENV must be unset or development', () => {
  assert.deepEqual(checkEnvironment(env, status), { appOrigin: 'http://localhost:3000' });
  assert.deepEqual(checkEnvironment({ ...env, NODE_ENV: 'development' }, status).appOrigin, 'http://localhost:3000');
  for (const NODE_ENV of ['production', 'test', ''])
    refused(() => checkEnvironment({ ...env, NODE_ENV }, status));
});

test('gate: APP_ORIGIN must be loopback', () => {
  for (const APP_ORIGIN of [undefined, 'https://app.example.test', 'http://app.example.test'])
    refused(() => checkEnvironment({ ...env, APP_ORIGIN }, status));
});

test('gate: Supabase URL must be loopback and the running local stack', () => {
  for (const NEXT_PUBLIC_SUPABASE_URL of [undefined, 'https://project.example.test', 'http://127.0.0.1:56999'])
    refused(() => checkEnvironment({ ...env, NEXT_PUBLIC_SUPABASE_URL }, status));
  for (const API_URL of [undefined, 'https://project.example.test'])
    refused(() => checkEnvironment(env, { API_URL }));
  refused(() => checkEnvironment(env, undefined));
});

test('targets only this checkout\'s local database container', () => {
  assert.equal(containerName('# c\nproject_id = "shared-garden-clock"\n'), 'supabase_db_shared-garden-clock');
  refused(() => containerName('project_id = "x; rm -rf"\n'));
  refused(() => containerName(''));
});

test('tokens are 12 random lowercase alphanumerics', () => {
  const token = newRefreshToken();
  assert.match(token, /^[a-z0-9]{12}$/);
  assert.notEqual(token, newRefreshToken());
});

test('seeding SQL keeps fake identities and the real binding path', () => {
  assert.deepEqual(FAKE_EMAILS, ['member1@example.test', 'member2@example.test']);
  assert.match(SEED_SQL, /private\.bootstrap_members\(:'email1', :'email2'\)\s+where not exists/);
  assert.match(SEED_SQL, /allowed_email like '%@example\.test' and revoked_at is null\) <> 2/);
  assert.match(SEED_SQL, /insert into auth\.identities/);
  assert.doesNotMatch(SEED_SQL, /garden_members\s+set/i, 'never writes bindings directly');
  assert.match(SEED_SQL, /'oauth'/);
});

test('refuses before touching the database when a gate fails', async () => {
  let ran = false;
  await assert.rejects(devSignIn({
    argv: ['--member', '1'], env: { ...env, NODE_ENV: 'production' }, status,
    sql: () => { ran = true; return ''; }, report: () => {},
  }), DevSignInError);
  await assert.rejects(devSignIn({
    argv: ['--member', '1'], env: { ...env, APP_ORIGIN: 'https://app.example.test' }, status,
    sql: () => { ran = true; return ''; }, report: () => {},
  }), DevSignInError);
  assert.equal(ran, false);
});

test('prints a loopback link only after one session is created', async () => {
  const lines = [];
  let vars;
  const link = await devSignIn({
    argv: ['--member', '2'], env, status, pickToken: () => 'abcdef123456',
    sql: (_input, v) => { vars = v; return '\ndev-signin-sessions:1\n'; },
    report: (line) => lines.push(line),
  });
  assert.deepEqual(vars, { email1: 'member1@example.test', email2: 'member2@example.test', member: '2', token: 'abcdef123456' });
  assert.equal(link, 'http://localhost:3000/auth/dev-sign-in?token=abcdef123456');
  assert.equal(lines.at(-1), link);
  await assert.rejects(devSignIn({
    argv: ['--member', '1'], env, status, sql: () => 'dev-signin-sessions:0\n', report: () => {},
  }), DevSignInError);
});
