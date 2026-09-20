# Native audio smoke template

Source for a disposable, bearer-protected probe that decodes **one fixed
synthetic fixture** with the same reviewed invocation, launcher and limits the
product uses. It exists to confirm that a Linux serverless runtime can execute
the versioned FFmpeg 9.0.1 programs at all. It is not part of the application.

`handler.ts` is versioned and reviewed here, and
[`src/test/native-smoke.test.ts`](../../src/test/native-smoke.test.ts) exercises
it. `generate.mjs` assembles the deployable project somewhere else.

## Boundaries

- Not under `src/app`, so it is never a route of this application, and
  `next.config.ts` is untouched. No module in `src/` imports `tools/`; the test
  asserts that, and `scripts/verify-audio-runtime.mjs` additionally asserts that
  no file under `tools/` is traced into the production server runtime. That
  assertion runs at verification time, after `npm run build`; a failure there
  means a build began pulling the template in, not that the template changed.
- The generated project has no Supabase URL, key, client or dependency, and no
  database, storage or authentication access. `generate.mjs` fails if any text
  file in the result mentions `SUPABASE`, `NEXT_PUBLIC_` or a key prefix.
- The only input is `src/test/fixtures/audio/tone-5.webm`, named by a module
  constant and verified against a pinned SHA-256 before it is decoded. There is
  no request body, query string, path segment, upload or caller argument.
- The response carries only bounded sanitized evidence: the fixture and output
  hashes, sample count, duration, channels, sample rate, Node version, platform,
  architecture, the decoder's first version line and elapsed milliseconds. No
  path, environment value or decoder diagnostic is ever returned.
- The generator writes no `vercel.json` and no `.vercel` link, and refuses to
  write inside this repository or into a git checkout.

## Authorization

`NATIVE_SMOKE_TOKEN` is read from the environment. Below 32 characters — or
absent — the probe answers `503` and reads, hashes and spawns nothing. A missing,
malformed or wrong bearer answers `401` before the fixture is opened. The
comparison is constant time over equal-length buffers.

Generate a disposable value locally and keep it out of this repository, out of
`.env.example`, out of shell history and out of any log or screenshot:

```sh
NATIVE_SMOKE_TOKEN="$(openssl rand -base64 48 | tr -d '\n=')"
```

Rotate or discard it when the probe is torn down. It authorizes nothing else and
must never be reused for the application.

## Local use

```sh
node tools/native-smoke/generate.mjs /absolute/path/outside/this/repository
cd /absolute/path/outside/this/repository
npm install --include=dev
CI=true npm run build
NATIVE_SMOKE_TOKEN=... npm run start
curl -fsS -H "Authorization: Bearer $NATIVE_SMOKE_TOKEN" http://localhost:3000/api/smoke
```

The generated manifest pins `typescript`, `@types/react` and `@types/node`
to the application's build dependency versions. Keep these development
dependencies installed during the build: Next's TypeScript check requires them,
and a clean CI builder refuses to install missing packages implicitly. The
generator regression test checks the emitted manifest; the clean Linux build
evidence is recorded in [release verification](../../docs/release/verification.md).

The programs under `vendor/audio/linux-x64` are Linux amd64. On macOS, decoding
needs a local build of the identical source into `vendor/audio/darwin-<arch>`
(see [`vendor/audio/README.md`](../../vendor/audio/README.md)); that directory is
ignored by git. Without it the authorized request answers `502 decode_failed`
and the decode case of `src/test/native-smoke.test.ts` is skipped, while every
authorization case still runs. The `502` is a missing local toolchain, not a
fixture or template fault.

## Hosted execution

Deploying this artifact, running it on a hosted Linux runtime and retaining its
bounded output belong to issue #37, after this source is reviewed and merged. It
is deployed separately from the product project, never linked to it, and removed
once the evidence is retained. Nothing in this directory proves hosted
execution; a local pass is a local pass.
