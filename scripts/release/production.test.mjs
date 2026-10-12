import test from 'node:test';
import assert from 'node:assert/strict';
import { release, inventory, buildConfiguration } from './production.mjs';

const sha = 'a'.repeat(40);
const version = '20261001000000';
function fixture() {
  const calls = [], reports = [], written = [];
  let historyReads = 0, projectReads = 0;
  const env = { GITHUB_SHA: sha, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'example/garden', GITHUB_TOKEN: 'github-secret',
    SUPABASE_ACCESS_TOKEN: 'db-secret', SUPABASE_PROJECT_ID: 'a'.repeat(20),
    VERCEL_TOKEN: 'host-secret', VERCEL_ORG_ID: 'private-team', VERCEL_PROJECT_ID: 'private-project' };
  const f = { env, calls, reports, written, remote: [], complete: [version], failedCI: false,
    failedCommand: '', badContract: false, wrongTarget: false,
    run(command, args, buildEnv) {
      if (buildEnv) f.buildEnv = buildEnv;
      calls.push([command, ...args]);
      const name = args[0];
      if (name === f.failedCommand) throw new Error('host-secret private.domain account@example.test');
      if (name === 'rev-parse') return sha;
      if (name === 'api') {
        if (args[1].startsWith('/v3/env/pull/')) return JSON.stringify({ env: {
          NEXT_PUBLIC_SUPABASE_URL: `https://${f.wrongTarget ? 'wrong' : env.SUPABASE_PROJECT_ID}.supabase.co`,
          APP_ORIGIN: 'https://private.example.test',
          PRESERVED_VALUE: 'literal \\n with "quotes"',
        } });
        projectReads++;
        return JSON.stringify({ id: env.VERCEL_PROJECT_ID, accountId: env.VERCEL_ORG_ID, name: 'private-project-name', nodeVersion: '24.x', framework: 'nextjs',
          link: { productionBranch: 'main' }, targets: { production: {
            meta: { githubCommitSha: projectReads === 1 ? 'b'.repeat(40) : sha }, readyState: 'READY',
          } } });
      }
      return 'sensitive provider output';
    },
    async api(url, token, body) {
      calls.push(['api', url]);
      if (url.includes('api.github.com')) return { workflow_runs: [{ id: 1, head_sha: sha,
        event: 'push', head_branch: 'main', status: 'completed', conclusion: f.failedCI ? 'failure' : 'success' }] };
      assert.equal(body.read_only, true);
      if (body.query.includes('schema_migrations')) return (historyReads++ ? f.complete : f.remote).map(version => ({ version }));
      return [{ ok: !f.badContract }];
    },
    write(file, contents) { written.push([file, contents]); },
    list: () => [`${version}_test.sql`], sleep: async () => {}, report: message => reports.push(message),
  };
  return f;
}
const commands = f => f.calls.filter(c => c[0] !== 'api').map(c => c.slice(0,2).join(' '));

test('build then migrate then audit then deploy exact SHA, including no pending migrations', async () => {
  for (const noop of [false,true]) {
    const f = fixture();
    if (noop) f.remote = [version];
    await release(f);
    const c = commands(f);
    assert(c.indexOf('vercel build') < c.indexOf('node_modules/.bin/supabase db'));
    assert(c.indexOf('node_modules/.bin/supabase db') < c.indexOf('vercel deploy'));
    assert.equal(f.calls.filter(c => c[0] === 'api' && c[1].includes('api.github.com')).length,4);
    for (const call of f.calls.filter(c => c[0] === 'api' && c[1].includes('api.github.com'))) assert(call[1].includes(`head_sha=${sha}`));
    const migration = f.calls.find(c => c[0] === 'node_modules/.bin/supabase');
    assert.deepEqual(migration.slice(1), ['db','push','--project-ref',f.env.SUPABASE_PROJECT_ID,'--skip-vault','--yes']);
    assert(f.calls.find(c => c[1] === 'deploy').includes(`githubCommitSha=${sha}`));
    assert(f.calls.find(c => c[1] === 'deploy').includes('--prebuilt'));
    assert(f.reports.indexOf('PASS: applied migration inventory') < f.reports.indexOf('PASS: production deployment'));
    assert(!JSON.stringify(f.reports).includes('private'));
  }
});

test('failed CI prevents any provider command', async () => {
  const f = fixture(); f.failedCI = true;
  await assert.rejects(release(f), /exact-commit CI/);
  assert.deepEqual(commands(f), ['git rev-parse']);
});

test('wrong SHA, event, branch, missing secret or wrong production target stop mutations', async () => {
  for (const [key,value] of [['GITHUB_SHA','c'.repeat(40)], ['GITHUB_EVENT_NAME','pull_request'],
    ['GITHUB_REF','refs/heads/other'], ['VERCEL_TOKEN','']]) {
    const f = fixture(); f.env[key] = value;
    await assert.rejects(release(f));
    assert(!commands(f).includes('vercel build'));
  }
  const f = fixture(); f.wrongTarget = true;
  await assert.rejects(release(f), /production target/);
  assert(!commands(f).includes('node_modules/.bin/supabase db'));
});

test('stale rerun cannot replace a newer production commit', async () => {
  const f = fixture(); f.failedCommand = 'merge-base';
  await assert.rejects(release(f), /production target/);
  assert.equal(f.written.length, 0);
});

test('failed build prevents migration; failed migration prevents deployment; neither leaks provider output', async () => {
  for (const [command,stage,forbidden] of [['build','production build','node_modules/.bin/supabase db'],
    ['db','database migrations','vercel deploy']]) {
    const f = fixture(); f.failedCommand = command;
    await assert.rejects(release(f), error => {
      assert(error.message.includes(stage));
      assert(!/host-secret|private.domain|account@example/.test(error.message));
      assert.equal(error.cause, undefined);
      return true;
    });
    assert(!commands(f).includes(forbidden));
  }
});

test('inventory rejects remote-only versions, duplicate local versions, and out-of-order missing migrations', () => {
  assert.throws(() => inventory(['1','2','3'], ['1','3']));
  assert.throws(() => inventory(['1','2'], ['1','2','3']));
  assert.throws(() => inventory(['1','1'], ['1']));
  assert.throws(() => inventory(['1'], [], true));
  inventory(['1','2'], ['1']);
});

test('unknown inventory stops build and all mutation', async () => {
  const f = fixture(); f.remote = ['20261005000000'];
  await assert.rejects(release(f), /forward migration inventory/);
  assert(!commands(f).includes('vercel build'));
});

test('missing applied migration or invalid API contract prevents deploy', async () => {
  for (const mode of ['inventory','contract']) {
    const f = fixture();
    if (mode === 'inventory') f.complete = [];
    else f.badContract = true;
    await assert.rejects(release(f), mode === 'inventory' ? /applied migration inventory/ : /Memories schema contract/);
    assert(!commands(f).includes('vercel deploy'));
  }
});

test('missing or nonmatching CI times out closed', async () => {
  const f = fixture(), api = f.api;
  let sleeps = 0;
  f.api = async (url, ...rest) => url.includes('api.github.com') ? { workflow_runs: [
    { id: 9, head_sha: 'f'.repeat(40), event: 'push', head_branch: 'main', status: 'completed', conclusion: 'success' },
  ] } : api(url,...rest);
  f.sleep = async () => { sleeps++; };
  await assert.rejects(release(f), /exact-commit CI/);
  assert.equal(sleeps,80);
  assert.deepEqual(commands(f), ['git rev-parse']);
});

test('pending checks are polled before any provider operation', async () => {
  const f = fixture(), api = f.api;
  let pending = true;
  f.api = async (url, ...rest) => pending && url.includes('api.github.com') ? { workflow_runs: [] } : api(url,...rest);
  f.sleep = async () => {
    assert.deepEqual(commands(f), ['git rev-parse']);
    pending = false;
  };
  await release(f);
  assert(commands(f).includes('vercel deploy'));
});

test('a deployment failure is reported without logging private provider output', async () => {
  const f = fixture(); f.failedCommand = 'deploy';
  await assert.rejects(release(f), /^Error: Release stopped at production deployment\. Inspect privately; do not publish provider logs\.$/);
  assert(!JSON.stringify(f.reports).includes('host-secret'));
});


test('project-scoped configuration skips team lookup and passes environment only to build', async () => {
  const f = fixture();
  await release(f);
  assert(!commands(f).includes('vercel pull'));
  assert(f.calls.some(c => c[1] === 'api' && c[2].startsWith('/v3/env/pull/')));
  assert.equal(f.written.length, 1);
  assert.equal(f.written[0][0], '.vercel/project.json');
  const link = JSON.parse(f.written[0][1]);
  assert.equal(link.projectId, f.env.VERCEL_PROJECT_ID);
  assert.equal(link.orgId, f.env.VERCEL_ORG_ID);
  assert.equal(link.projectName, 'private-project-name');
  assert.equal(link.settings.nodeVersion, '24.x');
  assert.equal(link.settings.framework, 'nextjs');
  assert.equal(f.buildEnv.APP_ORIGIN, 'https://private.example.test');
  assert(!f.written[0][1].includes('APP_ORIGIN'));
  assert(!JSON.stringify(f.reports).includes('private.example'));
});

test('project configuration preserves CLI settings and rejects invalid environment values', () => {
  const project = { id: 'project', accountId: 'team', name: 'garden',
    createdAt: 1, framework: 'nextjs', devCommand: null, buildCommand: 'npm run build',
    installCommand: 'npm ci', outputDirectory: null, rootDirectory: null,
    directoryListing: false, nodeVersion: '24.x', analytics: { id: 'analytics', enabledAt: 2, disabledAt: 1 } };
  const values = { QUOTED: `both ' and " quotes`, MULTILINE: 'first\nsecond', LITERAL: String.raw`backslash\n` };
  const config = buildConfiguration(project, { env: values });
  assert.equal(config.env, values);
  assert.equal(config.link.settings.analyticsId, 'analytics');
  for (const key of ['createdAt','framework','devCommand','buildCommand','installCommand',
    'outputDirectory','rootDirectory','directoryListing','nodeVersion']) assert.equal(config.link.settings[key], project[key]);
  assert.throws(() => buildConfiguration(project, {}));
  assert.throws(() => buildConfiguration(project, { env: { VALUE: null } }));
});
