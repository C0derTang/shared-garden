// @vitest-environment node
/** Opt-in real local Next routes, Auth, PostgREST and Storage. Never hosted. */
import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { closeSync, openSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, it } from "vitest";

const sunflower = process.env.LOCAL_MEDIA_MODE === "sunflower28";
const audio = Boolean(process.env.LOCAL_AUDIO_STATUS_FILE);
const statusPath =
  process.env.LOCAL_AUDIO_STATUS_FILE ?? process.env.LOCAL_MEDIA_STATUS_FILE;
const inputMime = audio ? "audio/webm" : "image/jpeg";
it.skipIf(!statusPath)(
  "enforces private media through actual Auth, Storage and server routes",
  async () => {
    const local = JSON.parse(readFileSync(statusPath!, "utf8"));
    const projectAudio = local.API_URL === "http://127.0.0.1:57721";
    expect(local.API_URL).toBe(
      sunflower
        ? "http://127.0.0.1:57821"
        : projectAudio
          ? "http://127.0.0.1:57721"
          : "http://127.0.0.1:57321",
    );
    expect(/^sb_publishable_/.test(local.PUBLISHABLE_KEY)).toBe(true);
    expect(/^sb_secret_/.test(local.SECRET_KEY)).toBe(true);
    const sql = (query: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          sunflower
            ? "supabase_db_shared-garden-sunflower28"
            : projectAudio
              ? "supabase_db_shared-garden-audio50"
              : "supabase_db_shared-garden-media48",
          "psql",
          "-U",
          "supabase_admin",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-At",
        ],
        { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    expect(
      sql(
        "select (select count(*) from private.garden_members)+(select count(*) from auth.users)+(select count(*) from public.garden)+(select count(*) from storage.objects)+(select count(*) from public.achievement_awards)+(select count(*) from public.achievement_progress);",
      ),
    ).toBe("0");
    const origin = sunflower
      ? "http://127.0.0.1:57829"
      : projectAudio
        ? "http://127.0.0.1:57729"
        : "http://127.0.0.1:57329";
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    const now = Math.floor(Date.now() / 1000);
    const tokens = ids.map((sub) => {
      const unsigned = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, amr: [{ method: "oauth", timestamp: now }], is_anonymous: false })).toString("base64url")}`;
      return `${unsigned}.${createHmac("sha256", local.JWT_SECRET).update(unsigned).digest("base64url")}`;
    });
    const cookies = tokens.map(
      (access_token, i) =>
        `sg-auth=base64-${Buffer.from(JSON.stringify({ access_token, refresh_token: "synthetic-not-issued", token_type: "bearer", expires_at: now + 3600, expires_in: 3600, user: { id: ids[i] } })).toString("base64url")}`,
    );
    const clients = tokens.map((token) =>
      createClient(local.API_URL, local.PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    const anon = createClient(local.API_URL, local.PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const trusted = createClient(local.API_URL, local.SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const log = openSync(
      sunflower
        ? "/tmp/shared-garden-issue28/web.log"
        : projectAudio
          ? "/tmp/shared-garden-issue50/web.log"
          : "/tmp/shared-garden-issue48/web.log",
      "w",
      0o600,
    );
    const webEnv = {
      ...process.env,
      APP_ORIGIN: origin,
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: local.SECRET_KEY,
    };
    // Exercise production output, and avoid next dev rewriting tracked type files.
    execFileSync(
      process.execPath,
      ["node_modules/next/dist/bin/next", "build"],
      {
        env: webEnv,
        stdio: ["ignore", log, log],
        timeout: 90_000,
      },
    );
    const web = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        sunflower ? "57829" : projectAudio ? "57729" : "57329",
      ],
      {
        env: webEnv,
        stdio: ["ignore", log, log],
      },
    );
    const post = async (
      path: string,
      body: unknown,
      actor: number | null = 0,
    ) => {
      const response = await fetch(`${origin}/api/media/${path}`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          origin,
          ...(actor === null ? {} : { cookie: cookies[actor] }),
        },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        data: response.headers.get("content-type")?.includes("application/json")
          ? await response.json()
          : null,
        cache: response.headers.get("cache-control"),
      };
    };
    try {
      for (let attempt = 0; attempt < 60; attempt++) {
        if (web.exitCode !== null)
          throw new Error(
            "Dedicated local web process exited; inspect private log",
          );
        try {
          if ((await fetch(origin)).ok) break;
        } catch {
          /* Startup may not be listening yet. */
        }
        if (attempt === 59)
          throw new Error("Dedicated local web process did not become ready");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      sql(`begin; set local role postgres; select private.bootstrap_members('owner@example.test','member@example.test'); reset role; set local role supabase_auth_admin;
    insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,encrypted_password,confirmation_token,recovery_token,email_change_token_new,email_change,email_confirmed_at) values
    ${ids.map((id, i) => `('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','${["owner", "member", "outsider"][i]}@example.test','{"provider":"google","providers":["google"]}','{}',now(),now(),'','','','','',now())`).join(",")};
    insert into auth.identities(user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values
    ${ids.map((id, i) => `('${id}','media-local-${i}','google','{"sub":"media-local-${i}","email":"${["owner", "member", "outsider"][i]}@example.test","email_verified":true}',now(),now(),now())`).join(",")}; commit;`);
      for (let i = 0; i < 2; i++) {
        const auth = await clients[i].auth.getUser(tokens[i]);
        expect(auth.error === null).toBe(true);
        const member = await clients[i].rpc("current_member");
        expect(member.data?.[0]?.member_id).toBe(i + 1);
      }
      expect((await post("intents", {}, null)).status).toBe(401);
      expect((await post("intents", {}, 2)).status).toBe(403);
      const init = await clients[0].rpc("initialize_garden");
      expect(init.error).toBeNull();
      sql(
        `insert into public.flower_unlocks(type_key) values('${audio ? "bluebell" : "sunflower"}');`,
      );
      const planted = await clients[0].rpc("plant_flower", {
        p_type_key: audio ? "bluebell" : "sunflower",
      });
      expect(planted.error).toBeNull();
      const flowerId = planted.data.id;
      const image = audio
        ? readFileSync(
            new URL("./fixtures/audio/tone-300.webm", import.meta.url),
          )
        : await sharp({
            create: {
              width: 5712,
              height: 4284,
              channels: 3,
              background: "#76985b",
            },
          })
            .jpeg()
            .withMetadata({ orientation: 6 })
            .withExifMerge({
              IFD3: {
                GPSLatitudeRef: "N",
                GPSLatitude: "1/1 2/1 3/1",
                GPSLongitudeRef: "E",
                GPSLongitude: "4/1 5/1 6/1",
              },
            })
            .toBuffer();
      // Match the browser SDK's multipart File upload path. Raw Node Buffer
      // uploads can leave the local proxy/Storage connection stalled when an
      // authorization rejection arrives before its request body is consumed.
      const uploadFile = (bytes: Buffer, mime = inputMime) =>
        new File([new Uint8Array(bytes)], "synthetic-media", { type: mime });
      const intent = async (
        bytes: Buffer,
        mimeType = inputMime,
        actor = 0,
        replacementEntryId?: number,
      ) => {
        const result = await post(
          "intents",
          {
            requestId: randomUUID(),
            flowerId,
            mimeType,
            byteLength: bytes.length,
            ...(replacementEntryId ? { replacementEntryId } : {}),
          },
          actor,
        );
        expect({ status: result.status, error: result.data?.error }).toEqual({
          status: 200,
          error: undefined,
        });
        return result.data;
      };
      const original = await intent(image);
      // An INSERT grant must not mint a longer-lived bearer upload capability.
      for (const upsert of [false, true]) {
        const signing = await clients[0].storage
          .from("garden-staging")
          .createSignedUploadUrl(original.staging_path, { upsert });
        expect(signing.error).toMatchObject({ status: 400 });
        expect(signing.data === null).toBe(true);
      }

      // Expired or revoked capabilities cannot recreate an object after cleanup.
      const abandoned = await intent(image, inputMime, 1);
      expect(
        (
          await clients[1].storage
            .from("garden-staging")
            .upload(abandoned.staging_path, uploadFile(image), {
              contentType: inputMime,
            })
        ).error,
      ).toBeNull();
      sql(
        `update private.media_uploads set expires_at=clock_timestamp()-interval '2 hours' where id='${abandoned.id}';`,
      );
      for (const upsert of [false, true]) {
        expect(
          (
            await clients[1].storage
              .from("garden-staging")
              .createSignedUploadUrl(abandoned.staging_path, { upsert })
          ).error,
        ).toMatchObject({ status: 400 });
      }
      expect((await post("cleanup", {})).status).toBe(200);
      expect(
        (
          await trusted.storage
            .from("garden-staging")
            .download(abandoned.staging_path)
        ).error,
      ).toMatchObject({ status: 400 });
      expect((await trusted.rpc("media_cleanup_candidates")).data).toEqual([]);
      expect(
        (
          await clients[1].storage
            .from("garden-staging")
            .upload(abandoned.staging_path, uploadFile(image), {
              contentType: inputMime,
            })
        ).error,
      ).toMatchObject({ status: 400 });
      expect(
        (
          await anon.storage
            .from("garden-staging")
            .upload(abandoned.staging_path, uploadFile(image), {
              contentType: inputMime,
            })
        ).error,
      ).toMatchObject({ status: 400 });
      const revoked = await intent(image, inputMime, 1);
      sql(
        "update private.garden_members set revoked_at=now() where member_id=2;",
      );
      expect(
        (
          await clients[1].storage
            .from("garden-staging")
            .upload(revoked.staging_path, uploadFile(image), { contentType: inputMime })
        ).error,
      ).toMatchObject({ status: 400 });
      for (const upsert of [false, true]) {
        expect(
          (
            await clients[1].storage
              .from("garden-staging")
              .createSignedUploadUrl(revoked.staging_path, { upsert })
          ).error,
        ).toMatchObject({ status: 400 });
      }
      sql(
        `update private.media_uploads set expires_at=clock_timestamp()-interval '2 hours' where id='${revoked.id}';`,
      );
      expect((await post("cleanup", {})).status).toBe(200);
      expect(
        (
          await clients[1].storage
            .from("garden-staging")
            .upload(revoked.staging_path, uploadFile(image), { contentType: inputMime })
        ).error,
      ).toMatchObject({ status: 400 });
      expect((await trusted.rpc("media_cleanup_candidates")).data).toEqual([]);
      expect(
        sql(
          `select count(*) from storage.objects where bucket_id='garden-staging' and name in ('${abandoned.staging_path}', '${revoked.staging_path}');`,
        ),
      ).toBe("0");
      sql(
        "update private.garden_members set revoked_at=null where member_id=2;",
      );
      // Storage, not a Vercel body handler, enforces the direct transfer ceiling.
      expect(
        (
          await clients[0].storage
            .from("garden-staging")
            .upload(original.staging_path, uploadFile(Buffer.alloc(12 * 1024 * 1024 + 1)), {
              contentType: inputMime,
            })
        ).error,
      ).toMatchObject({ status: 400 });
      expect(
        (
          await clients[1].storage
            .from("garden-staging")
            .upload(original.staging_path, uploadFile(image), { contentType: inputMime })
        ).error,
      ).toMatchObject({ status: 400 });
      expect(
        (
          await anon.storage
            .from("garden-staging")
            .upload(original.staging_path, uploadFile(image), { contentType: inputMime })
        ).error,
      ).toMatchObject({ status: 400 });
      expect(
        (
          await clients[2].storage
            .from("garden-staging")
            .upload(original.staging_path, uploadFile(image), { contentType: inputMime })
        ).error,
      ).toMatchObject({ status: 400 });
      expect(
        (
          await clients[0].storage
            .from("garden-staging")
            .upload(original.staging_path, uploadFile(image), {
              contentType: inputMime,
              upsert: false,
            })
        ).error,
      ).toBeNull();
      expect(
        (
          await clients[0].storage
            .from("garden-staging")
            .upload(original.staging_path, uploadFile(Buffer.from("replacement")), {
              contentType: inputMime,
              upsert: true,
            })
        ).error,
      ).toMatchObject({ status: 400 });
      expect(
        (
          await clients[0].storage
            .from("garden-staging")
            .download(original.staging_path)
        ).error,
      ).toMatchObject({ status: 400 });
      expect(
        (
          await clients[0].storage
            .from("garden-staging")
            .createSignedUrl(original.staging_path, 60)
        ).error,
      ).toMatchObject({ status: 400 });
      expect((await post("read", { mediaId: original.id })).status).toBe(403);
      expect((await post("finalize", { mediaId: original.id }, 1)).status).toBe(
        403,
      );
      const concurrent = await Promise.all([
        post("finalize", { mediaId: original.id }),
        post("finalize", { mediaId: original.id }),
      ]);
      expect(concurrent.some((r) => r.status === 200)).toBe(true);
      expect(
        concurrent.every(
          (r) =>
            r.status === 200 ||
            (r.status === 409 && r.data?.error === "media_processing"),
        ),
      ).toBe(true);
      const done = await post("finalize", { mediaId: original.id });
      expect(done.status).toBe(200);
      const entryId = done.data.entryId;
      expect(sql("select count(*) from public.flower_entries;")).toBe("1");
      const originalTime = sql(
        `select original_posted_at from public.flower_entries where id=${entryId};`,
      );
      const signed = await post("read", { mediaId: original.id }, 1);
      expect(signed.status).toBe(200);
      expect(signed.cache).toContain("no-store");
      if (!audio)
        expect([
          signed.data.width,
          signed.data.height,
          signed.data.expiresIn,
        ]).toEqual([4284, 5712, 60]);
      const signedToken = new URL(signed.data.url).searchParams.get("token")!;
      const signedClaims = JSON.parse(
        Buffer.from(signedToken.split(".")[1], "base64url").toString(),
      );
      expect(signedClaims.exp - signedClaims.iat).toBe(60);
      const response = await fetch(signed.data.url);
      expect(response.status).toBe(200);
      const stored = Buffer.from(await response.arrayBuffer());
      if (audio) {
        expect(signed.data.mimeType).toBe("audio/wav");
        expect(signed.data.samples).toBe(14400000);
        expect(signed.data.channels).toBe(1);
        expect(stored.toString("ascii", 0, 4)).toBe("RIFF");
        expect(stored.length).toBe(signed.data.samples * 2 + 44);
      } else {
        const metadata = await sharp(stored).metadata();
        expect([
          metadata.width,
          metadata.height,
          metadata.exif,
          metadata.xmp,
          metadata.orientation,
        ]).toEqual([4284, 5712, undefined, undefined, undefined]);
      }
      for (const client of [...clients, anon]) {
        expect(
          (
            await client.storage
              .from("garden-media")
              .download(original.final_path)
          ).error,
        ).toMatchObject({ status: 400 });
        expect(
          (
            await client.storage
              .from("garden-media")
              .createSignedUrl(original.final_path, 60)
          ).error,
        ).toMatchObject({ status: 400 });
        expect(
          (
            await client.storage
              .from("garden-media")
              .upload(original.final_path, uploadFile(image), {
                contentType: inputMime,
                upsert: true,
              })
          ).error,
        ).toMatchObject({ status: 400 });
        const listing = await client.storage.from("garden-media").list();
        expect(listing.error).toBeNull();
        expect(listing.data).toEqual([]);
      }
      expect(
        (
          await clients[1].rpc("submit_flower_entry", {
            p_flower_id: flowerId,
            p_payload: { media_id: original.id },
          })
        ).error?.code,
      ).toBe("42501");
      const replacement = await intent(image, inputMime, 0, entryId);
      expect(
        (
          await clients[0].storage
            .from("garden-staging")
            .upload(replacement.staging_path, uploadFile(image), {
              contentType: inputMime,
            })
        ).error,
      ).toBeNull();
      expect((await post("finalize", { mediaId: replacement.id })).status).toBe(
        200,
      );
      expect(
        sql(
          `select original_posted_at from public.flower_entries where id=${entryId};`,
        ),
      ).toBe(originalTime);
      expect((await post("read", { mediaId: original.id })).status).toBe(403);
      const late = await intent(image, inputMime, 0, entryId);
      expect(
        (
          await clients[0].storage
            .from("garden-staging")
            .upload(late.staging_path, uploadFile(image), { contentType: inputMime })
        ).error,
      ).toBeNull();
      sql(
        `update public.flower_entries set original_posted_at=clock_timestamp()-interval '31 minutes' where id=${entryId};`,
      );
      expect((await post("finalize", { mediaId: late.id })).data?.error).toBe(
        "entry_rejected",
      );
      expect(
        sql(
          `select payload->>'media_id' from public.flower_entries where id=${entryId};`,
        ),
      ).toBe(replacement.id);
      // Invalid upload bytes never become entries, even with a permitted MIME.
      for (const [bytes, mime, code] of audio
        ? ([
            [Buffer.from("invalid"), inputMime, "invalid_audio"],
            [
              readFileSync(
                new URL("./fixtures/audio/tone-301.webm", import.meta.url),
              ),
              inputMime,
              "invalid_audio",
            ],
            [
              readFileSync(
                new URL(
                  "./fixtures/audio/forged-padding.webm",
                  import.meta.url,
                ),
              ),
              inputMime,
              "invalid_audio",
            ],
          ] as const)
        : ([
            [Buffer.from("<svg>bad</svg>"), inputMime, "invalid_photo"],
            [
              await sharp({
                create: {
                  width: 5001,
                  height: 5000,
                  channels: 3,
                  background: "white",
                },
              })
                .jpeg()
                .toBuffer(),
              inputMime,
              "invalid_photo",
            ],
            [
              readFileSync(
                new URL("./fixtures/two-frame.apng", import.meta.url),
              ),
              "image/png",
              "unsupported_photo",
            ],
            [
              await sharp({
                create: {
                  width: 80,
                  height: 40,
                  channels: 3,
                  background: "red",
                },
              })
                .png()
                .toBuffer(),
              inputMime,
              "type_mismatch",
            ],
          ] as const)) {
        const bad = await intent(bytes, mime, 1);
        expect(
          (
            await clients[1].storage
              .from("garden-staging")
              .upload(bad.staging_path, uploadFile(bytes, mime), { contentType: mime })
          ).error,
        ).toBeNull();
        expect(
          (await post("finalize", { mediaId: bad.id }, 1)).data?.error,
        ).toBe(code);
        expect(
          sql(`select count(*) from public.flower_entries where author_id=2;`),
        ).toBe("0");
        sql(
          `update private.media_uploads set expires_at=clock_timestamp()-interval '2 hours' where id='${bad.id}';`,
        );
      }
      sql(
        `update private.media_uploads set expires_at=clock_timestamp()-interval '2 hours' where entry_id is null;`,
      );
      expect((await post("cleanup", {})).status).toBe(200);
      expect(
        (
          await trusted.storage
            .from("garden-media")
            .download(replacement.final_path)
        ).error,
      ).toBeNull();
      expect(
        (
          await trusted.storage
            .from("garden-staging")
            .download(replacement.staging_path)
        ).error,
      ).toMatchObject({ status: 400 });
      expect((await post("read", { mediaId: replacement.id }, 1)).status).toBe(
        200,
      );
      sql(
        "update private.garden_members set revoked_at=now() where member_id=2;",
      );
      expect((await post("read", { mediaId: replacement.id }, 1)).status).toBe(
        403,
      );
      expect(
        (await clients[1].rpc("media_read_path", { p_id: replacement.id }))
          .error?.code,
      ).toBe("42501");
      expect((await post("read", { mediaId: replacement.id }, 2)).status).toBe(
        403,
      );
      expect(
        (await post("read", { mediaId: replacement.id }, null)).status,
      ).toBe(401);
    } finally {
      web.kill("SIGTERM");
      closeSync(log);
      // Remove only objects from this previously empty dedicated local fixture.
      for (const bucket of ["garden-staging", "garden-media"]) {
        const paths = sql(
          `select coalesce(json_agg(name),'[]') from storage.objects where bucket_id='${bucket}';`,
        );
        if (JSON.parse(paths).length)
          expect(
            (await trusted.storage.from(bucket).remove(JSON.parse(paths)))
              .error,
          ).toBeNull();
      }
      sql(
        `begin; delete from public.achievement_awards; delete from public.achievement_progress; delete from private.media_uploads; delete from public.flower_entries; delete from public.daisy_assignments; delete from public.flower_day_facts; delete from public.before_noon_snapshots; delete from public.peony_activity; delete from public.garden_days; delete from public.flowers; delete from public.flower_unlocks; delete from public.garden; delete from private.garden_members; delete from auth.users where id in (${ids.map((id) => `'${id}'`).join(",")}); commit;`,
      );
    }
    expect(
      sql(
        "select (select count(*) from private.garden_members)+(select count(*) from auth.users)+(select count(*) from public.garden)+(select count(*) from storage.objects)+(select count(*) from public.achievement_awards)+(select count(*) from public.achievement_progress);",
      ),
    ).toBe("0");
  },
  120_000,
);
