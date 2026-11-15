// Operator setup for the private production copies of the sunset home media.
// Idempotent: creates the private bucket if it is missing (matching the
// 20261115000000_home_media migration), validates both files, then upserts them
// under fixed keys. Prints only sizes, counts and SHA-256 hashes: never the
// project URL, secret, local paths, provider responses or file contents.
//
// Usage:
//   node --env-file=<private env file> scripts/setup-home-media.mjs \
//     --audio <absolute .mp3 path> --lyrics <absolute .json path>
// Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
// --audio/--lyrics fall back to SUNSET_AUDIO_PATH/SUNSET_LYRICS_PATH.
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { parseLyrics } from '../src/lib/landing/lyrics.ts';

export const BUCKET = {
  id: 'home-media',
  public: false,
  file_size_limit: 16 * 1024 * 1024,
  allowed_mime_types: ['audio/mpeg', 'application/json'],
};
export const KEYS = { audio: 'sunset/recording.mp3', lyrics: 'sunset/lyrics.json' };
const lyricLimit = 256 * 1024;

export class SetupError extends Error {}
const fail = (message) => { throw new SetupError(message); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function argument(argv, name) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function options(argv, env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !/^https:\/\/[^/]+\/?$/.test(url)) fail('NEXT_PUBLIC_SUPABASE_URL must be the https project origin.');
  if (!secret || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) fail('SUPABASE_SECRET_KEY must be a server secret key.');
  const audio = (argument(argv, 'audio') ?? env.SUNSET_AUDIO_PATH ?? '').trim();
  const lyrics = (argument(argv, 'lyrics') ?? env.SUNSET_LYRICS_PATH ?? '').trim();
  if (!path.isAbsolute(audio) || path.extname(audio).toLowerCase() !== '.mp3') fail('Pass --audio with an absolute .mp3 path.');
  if (!path.isAbsolute(lyrics) || path.extname(lyrics).toLowerCase() !== '.json') fail('Pass --lyrics with an absolute .json path.');
  return { origin: new URL(url).origin, secret, audio, lyrics };
}

export function validateAudio(bytes) {
  if (bytes.length <= 0 || bytes.length > BUCKET.file_size_limit) fail('Recording must be between 1 byte and 16 MiB.');
  const id3 = bytes.subarray(0, 3).toString('latin1') === 'ID3';
  const frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (!id3 && !frame) fail('Recording is not an MPEG audio file.');
  return bytes;
}

/** Uploads only the parser's normalized output, which drops private metadata. */
export function validateLyrics(bytes) {
  if (bytes.length <= 0 || bytes.length > lyricLimit) fail('Lyrics must be between 1 byte and 256 KiB.');
  let parsed;
  try { parsed = parseLyrics(JSON.parse(bytes.toString('utf8'))); } catch { parsed = null; }
  if (!parsed) fail('Lyrics do not satisfy the application parser.');
  const normalized = Buffer.from(JSON.stringify(parsed));
  if (normalized.length > lyricLimit) fail('Normalized lyrics exceed 256 KiB.');
  return { bytes: normalized, cues: parsed.cues.length };
}

function client({ origin, secret }, fetchImpl) {
  return async (pathname, init = {}) => {
    try {
      return await fetchImpl(new URL(pathname, origin), {
        ...init,
        headers: { apikey: secret, Authorization: `Bearer ${secret}`, ...init.headers },
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(60_000),
      });
    } catch {
      fail('Storage request failed.');
    }
  };
}

const sameBucket = (bucket) => bucket.public === BUCKET.public
  && Number(bucket.file_size_limit) === BUCKET.file_size_limit
  && JSON.stringify([...(bucket.allowed_mime_types ?? [])].sort()) === JSON.stringify([...BUCKET.allowed_mime_types].sort());

export async function ensureBucket(request) {
  const listed = await request('/storage/v1/bucket');
  if (!listed.ok) fail(`Could not list buckets (HTTP ${listed.status}).`);
  const existing = (await listed.json()).find((bucket) => bucket.id === BUCKET.id);
  if (existing) {
    if (!sameBucket(existing)) fail('Existing home media bucket settings differ; refusing to change them.');
    return 'present';
  }
  const created = await request('/storage/v1/bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET.id, name: BUCKET.id, ...BUCKET }),
  });
  if (!created.ok) fail(`Could not create the private bucket (HTTP ${created.status}).`);
  return 'created';
}

async function upload(request, key, bytes, type) {
  const response = await request(`/storage/v1/object/${BUCKET.id}/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': type, 'x-upsert': 'true' },
    body: bytes,
  });
  await response.body?.cancel().catch(() => {});
  if (!response.ok) fail(`Upload failed (HTTP ${response.status}).`);
  const check = await request(`/storage/v1/object/authenticated/${BUCKET.id}/${key}`);
  const stored = check.ok ? Buffer.from(await check.arrayBuffer()) : null;
  if (!stored || sha256(stored) !== sha256(bytes)) fail('Uploaded object did not verify.');
}

export async function setup({ argv = [], env = {}, fetchImpl = globalThis.fetch, read = readFile, log = console.log } = {}) {
  const settings = options(argv, env);
  const audio = validateAudio(await read(settings.audio).catch(() => fail('Recording could not be read.')));
  const lyrics = validateLyrics(await read(settings.lyrics).catch(() => fail('Lyrics could not be read.')));
  const request = client(settings, fetchImpl);
  log(`Private bucket: ${await ensureBucket(request)}.`);
  await upload(request, KEYS.audio, audio, 'audio/mpeg');
  log(`Recording: ${audio.length} bytes, sha256 ${sha256(audio)}, verified.`);
  await upload(request, KEYS.lyrics, lyrics.bytes, 'application/json');
  log(`Lyrics: ${lyrics.cues} cues, ${lyrics.bytes.length} bytes, sha256 ${sha256(lyrics.bytes)}, verified.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setup({ argv: process.argv.slice(2), env: process.env }).catch((error) => {
    console.error(error instanceof SetupError ? error.message : 'Setup failed.');
    process.exitCode = 1;
  });
}
