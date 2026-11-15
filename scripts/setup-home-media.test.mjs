import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import { BUCKET, KEYS, setup } from './setup-home-media.mjs';

const { Response } = globalThis;

const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://project.example.test', SUPABASE_SECRET_KEY: 'sb_secret_synthetic_value' };
const argv = ['--audio', '/synthetic/private/recording.mp3', '--lyrics', '/synthetic/private/lyrics.json'];
const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 7)]);
const lyrics = Buffer.from(JSON.stringify({ version: 1, source: 'private metadata', cues: [{ start: 1, end: 2, text: 'Synthetic' }] }));
const read = async (file) => (file.endsWith('.mp3') ? audio : lyrics);

function fakeStorage({ buckets = [] } = {}) {
  const objects = new Map();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const { pathname } = new URL(url);
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers });
    if (pathname === '/storage/v1/bucket' && (init.method ?? 'GET') === 'GET') return Response.json(buckets);
    if (pathname === '/storage/v1/bucket') { buckets.push(JSON.parse(init.body)); return Response.json({ name: 'home-media' }); }
    const upload = pathname.match(/^\/storage\/v1\/object\/home-media\/(.+)$/);
    if (upload && init.method === 'POST') { objects.set(upload[1], Buffer.from(init.body)); return Response.json({ Key: 'x' }); }
    const read = pathname.match(/^\/storage\/v1\/object\/authenticated\/home-media\/(.+)$/);
    if (read && objects.has(read[1])) return new Response(objects.get(read[1]));
    return new Response('provider detail project.example.test', { status: 400 });
  };
  return { fetchImpl, calls, objects, buckets };
}

test('creates the private bucket, uploads normalized media under fixed keys, and logs only hashes', async () => {
  const storage = fakeStorage();
  const lines = [];
  await setup({ argv, env, fetchImpl: storage.fetchImpl, read, log: (line) => lines.push(line) });
  assert.deepEqual(storage.buckets[0], { id: 'home-media', name: 'home-media', ...BUCKET });
  assert.deepEqual(storage.objects.get(KEYS.audio), audio);
  assert.deepEqual(JSON.parse(storage.objects.get(KEYS.lyrics)), { version: 1, cues: [{ start: 1, end: 2, text: 'Synthetic' }] });
  assert.ok(storage.calls.every((call) => call.headers.apikey === env.SUPABASE_SECRET_KEY));
  assert.ok(storage.calls.some((call) => call.headers['x-upsert'] === 'true'));
  const output = lines.join('\n');
  assert.match(output, /Private bucket: created/);
  for (const hidden of ['sb_secret', 'project.example.test', '/synthetic/private', 'Synthetic', 'private metadata']) assert.ok(!output.includes(hidden), hidden);
});

test('is idempotent when the matching bucket already exists', async () => {
  const storage = fakeStorage({ buckets: [{ id: 'home-media', ...BUCKET }] });
  const lines = [];
  await setup({ argv, env, fetchImpl: storage.fetchImpl, read, log: (line) => lines.push(line) });
  assert.match(lines[0], /present/);
  assert.equal(storage.calls.filter((call) => call.method === 'POST' && call.url.endsWith('/bucket')).length, 0);
});

test('refuses to alter a bucket with different settings', async () => {
  const storage = fakeStorage({ buckets: [{ id: 'home-media', ...BUCKET, public: true }] });
  await assert.rejects(setup({ argv, env, fetchImpl: storage.fetchImpl, read, log: () => {} }), /settings differ/);
  assert.equal(storage.objects.size, 0);
});

test('validates inputs before contacting storage', async () => {
  const storage = fakeStorage();
  const cases = [
    [{ ...env, SUPABASE_SECRET_KEY: 'publishable' }, argv, read, /SUPABASE_SECRET_KEY/],
    [{ ...env, NEXT_PUBLIC_SUPABASE_URL: 'http://insecure.test' }, argv, read, /NEXT_PUBLIC_SUPABASE_URL/],
    [env, ['--audio', 'relative.mp3', '--lyrics', '/x/lyrics.json'], read, /--audio/],
    [env, argv, async (file) => (file.endsWith('.mp3') ? Buffer.from('<html>') : lyrics), /not an MPEG/],
    [env, argv, async (file) => (file.endsWith('.mp3') ? audio : Buffer.from('{"version":1,"cues":[{"start":2,"end":1,"text":"x"}]}')), /parser/],
    [env, argv, async (file) => (file.endsWith('.mp3') ? Buffer.alloc(BUCKET.file_size_limit + 1, 0xff) : lyrics), /16 MiB/],
  ];
  for (const [caseEnv, caseArgv, caseRead, message] of cases)
    await assert.rejects(setup({ argv: caseArgv, env: caseEnv, fetchImpl: storage.fetchImpl, read: caseRead, log: () => {} }), message);
  assert.equal(storage.calls.length, 0);
});

test('reports provider failures without their bodies', async () => {
  const fetchImpl = async () => new Response('secret provider detail', { status: 500 });
  await assert.rejects(setup({ argv, env, fetchImpl, read, log: () => {} }), (error) => {
    assert.match(error.message, /HTTP 500/);
    assert.ok(!error.message.includes('provider detail'));
    return true;
  });
});
