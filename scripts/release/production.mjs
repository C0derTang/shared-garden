import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL, URL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const workflows = ['web.yml', 'database.yml', 'media.yml', 'audio.yml'];
const historyQuery = 'select version from supabase_migrations.schema_migrations order by version';
export const contractQuery = `with expected as (
  select to_regprocedure('public.memories_page(text,jsonb,text[],text,integer,date,date,integer)') as oid
) select coalesce(p.oid is not null
  and p.proargnames = array['p_mode','p_cursor','p_keys','p_type','p_spot','p_from','p_to','p_author']::text[]
  and p.pronargdefaults = 8 and p.provolatile = 's' and not p.prosecdef
  and p.proconfig = array['search_path=pg_catalog']::text[]
  and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  and not has_function_privilege('anon', p.oid, 'EXECUTE')
  and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  and not has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE')
  and not exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
    where a.grantee=0 and a.privilege_type='EXECUTE')
  and to_regprocedure('public.memories_page(text,jsonb,text[],text,integer,date,date)') is null,
  false) as ok from expected e left join pg_proc p on p.oid=e.oid`;

export function inventory(local, remote, complete = false) {
  if (!local.length || new Set(local).size !== local.length ||
      remote.length > local.length || remote.some((version, i) => version !== local[i]) ||
      (complete && remote.length !== local.length)) throw new Error('Migration inventory mismatch');
}

// Match the settings written by Vercel CLI 59.20.0's writeProjectSettings.
// Its pull command requires team metadata unavailable to project-scoped tokens;
// these project-only API reads retain that narrower credential boundary.
export function buildConfiguration(project, envResponse) {
  if (!project.name || !envResponse.env || Array.isArray(envResponse.env) ||
      Object.values(envResponse.env).some(value => typeof value !== 'string')) throw new Error();
  const settings = Object.fromEntries(['createdAt', 'framework', 'devCommand',
    'installCommand', 'buildCommand', 'outputDirectory', 'rootDirectory',
    'directoryListing', 'nodeVersion'].map(key => [key, project[key]]));
  const analytics = project.analytics;
  if (analytics?.id && (!analytics.disabledAt || analytics.enabledAt > analytics.disabledAt)) {
    settings.analyticsId = analytics.id;
  }
  return {
    link: { projectId: project.id, orgId: project.accountId, projectName: project.name, settings },
    env: envResponse.env,
  };
}

// All external output stays captured. Callers receive only a fixed stage label:
// provider error messages, command arguments and URLs must never enter CI logs.
export async function release({ env, run, api, write, list, sleep, report }) {
  let stage = 'configuration';
  async function step(name, fn) {
    stage = name;
    const result = await fn();
    report(`PASS: ${name}`);
    return result;
  }
  try {
    const sha = env.GITHUB_SHA;
    if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== 'refs/heads/main' ||
        !/^[a-f0-9]{40}$/.test(sha ?? '') ||
        !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '')) throw new Error();
    for (const key of ['GITHUB_TOKEN', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_ID',
      'VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) if (!env[key]?.trim()) throw new Error();
    if (!/^[a-z]{20}$/.test(env.SUPABASE_PROJECT_ID)) throw new Error();
    if (run('git', ['rev-parse', 'HEAD']).trim() !== sha) throw new Error();
    const vercel = (args, buildEnv) => run('vercel', [...args, '--token', env.VERCEL_TOKEN], buildEnv);
    const projectUrl = `/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}?teamId=${encodeURIComponent(env.VERCEL_ORG_ID)}`;
    const project = () => JSON.parse(vercel(['api', projectUrl, '--raw']));
    const query = sql => api(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_ID}/database/query`,
      env.SUPABASE_ACCESS_TOKEN, { query: sql, read_only: true });
    const versions = () => query(historyQuery).then(rows => rows.map(row => row.version));
    await step('exact-commit CI', async () => {
      for (let attempt = 0; attempt < 80; attempt++) {
        let ready = true;
        for (const workflow of workflows) {
          const data = await api(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/runs?head_sha=${sha}&event=push&branch=main&per_page=100`, env.GITHUB_TOKEN);
          const candidate = data.workflow_runs?.filter(r => r.head_sha === sha && r.event === 'push' && r.head_branch === 'main').sort((a,b) => b.id-a.id)[0];
          if (!candidate || candidate.status !== 'completed') ready = false;
          else if (candidate.conclusion !== 'success') throw new Error();
        }
        if (ready) return;
        await sleep(15000);
      }
      throw new Error();
    });
    const buildEnv = await step('production target', () => {
      const p = project();
      if (p.id !== env.VERCEL_PROJECT_ID || p.accountId !== env.VERCEL_ORG_ID || p.link?.productionBranch !== 'main') throw new Error();
      const previous = p.targets?.production?.meta?.githubCommitSha;
      // Also rejects stale reruns after a newer successful production release.
      if (!/^[a-f0-9]{40}$/.test(previous ?? '')) throw new Error();
      run('git', ['merge-base', '--is-ancestor', previous, sha]);
      const envUrl = `/v3/env/pull/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/production?source=vercel-cli%3Apull&teamId=${encodeURIComponent(env.VERCEL_ORG_ID)}`;
      const config = buildConfiguration(p, JSON.parse(vercel(['api', envUrl, '--raw'])));
      if (config.env.NEXT_PUBLIC_SUPABASE_URL !== `https://${env.SUPABASE_PROJECT_ID}.supabase.co`) throw new Error();
      // This single-project repository builds at its checked-out root.
      if (p.rootDirectory && p.rootDirectory !== '.') throw new Error();
      write('.vercel/project.json', JSON.stringify(config.link));
      return config.env;
    });
    const local = list('supabase/migrations').map(name => {
      if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(name)) throw new Error();
      return name.slice(0,14);
    }).sort();
    await step('forward migration inventory', async () => inventory(local, await versions()));
    await step('production build', () => vercel(['build', '--prod'], buildEnv));
    await step('database migrations', () => run('node_modules/.bin/supabase', [
      'db', 'push', '--project-ref', env.SUPABASE_PROJECT_ID, '--skip-vault', '--yes',
    ]));
    await step('applied migration inventory', async () => inventory(local, await versions(), true));
    await step('Memories schema contract', async () => {
      const rows = await query(contractQuery);
      if (rows.length !== 1 || rows[0].ok !== true) throw new Error();
    });
    await step('production deployment', () => vercel([
      'deploy', '--prebuilt', '--prod', '--yes', '--meta', `githubCommitSha=${sha}`,
      '--meta', 'githubCommitRef=main',
    ]));
    await step('deployed commit', () => {
      const p = project();
      if (p.targets?.production?.meta?.githubCommitSha !== sha ||
          p.targets.production.readyState !== 'READY') throw new Error();
    });
  } catch {
    // Do not forward an underlying Error, even as a cause: it can contain secrets.
    throw new Error(`Release stopped at ${stage}. Inspect privately; do not publish provider logs.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  const run = (command, args, buildEnv = {}) => execFileSync(command, args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...buildEnv, CI: 'true', NO_COLOR: '1', VERCEL_TELEMETRY_DISABLED: '1' },
  });
  const api = async (url, token, body) => {
    const result = await globalThis.fetch(new URL(url), {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: globalThis.AbortSignal.timeout(60000),
    });
    if (!result.ok) throw new Error();
    return result.json();
  };
  try {
    await release({ env: process.env, run, api, write: (file, contents) => {
      fs.mkdirSync('.vercel', { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, contents, { mode: 0o600 });
    },
      list: dir => fs.readdirSync(dir), sleep: setTimeout, report: line => console.log(line) });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    // No provider logs or build artifacts are uploaded, including on failure.
    fs.rmSync('.vercel', { recursive: true, force: true });
    fs.rmSync('.next', { recursive: true, force: true });
    fs.rmSync('supabase/.temp', { recursive: true, force: true });
  }
}
