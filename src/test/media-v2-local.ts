/**
 * New-garden (v2) private media through the actual local Next routes, Auth,
 * PostgREST and Storage (issue #178). Called by the opt-in media-local test
 * with its disposable fixture; never hosted. The garden discriminator is the
 * only browser input that selects the registry, buckets and RPCs.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect } from "vitest";

type Posted = {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  cache: string | null;
};
export type MediaLocalContext = {
  post: (path: string, body: unknown, actor?: number | null) => Promise<Posted>;
  clients: SupabaseClient[];
  anon: SupabaseClient;
  trusted: SupabaseClient;
  sql: (query: string) => string;
  uploadFile: (bytes: Buffer, mime?: string) => File;
  media: Buffer;
  inputMime: string;
  audio: boolean;
};

export async function exerciseV2Media({
  post,
  clients,
  anon,
  trusted,
  sql,
  uploadFile,
  media,
  inputMime,
  audio,
}: MediaLocalContext) {
  const type = audio ? "bluebell" : "sunflower";
  const planted = await clients[0].rpc("v2_plant_flower_at", {
    p_type_key: type,
    p_spot: 1,
  });
  expect(planted.error).toBeNull();
  const flowerId = planted.data.id;
  const staging = (client: SupabaseClient) =>
    client.storage.from("garden-v2-staging");
  const final = (client: SupabaseClient) =>
    client.storage.from("garden-v2-media");
  const intent = async (actor = 0, replacementEntryId?: number) => {
    const result = await post(
      "intents",
      {
        requestId: randomUUID(),
        flowerId,
        mimeType: inputMime,
        byteLength: media.length,
        garden: "v2",
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

  // The discriminator is validated server side; unknown values never reach
  // a registry, and a v2 flower is not a legacy media target.
  for (const garden of ["v3", "", null, "garden-v2-staging", 2])
    expect(
      await post("intents", {
        requestId: randomUUID(),
        flowerId,
        mimeType: inputMime,
        byteLength: media.length,
        garden,
      }),
    ).toMatchObject({ status: 400, data: { error: "invalid_request" } });
  expect((await post("cleanup", { garden: "everything" })).data?.error).toBe(
    "invalid_request",
  );
  const original = await intent();
  expect(original.status).toBe("pending");
  expect(original.final_path).toBe(
    `${original.id}/${audio ? "audio.wav" : "photo.jpg"}`,
  );

  // Same direct-upload boundary as legacy, in its own private bucket only.
  for (const upsert of [false, true])
    expect(
      (
        await staging(clients[0]).createSignedUploadUrl(original.staging_path, {
          upsert,
        })
      ).error,
    ).toMatchObject({ status: 400 });
  expect(
    (
      await clients[0].storage
        .from("garden-staging")
        .upload(original.staging_path, uploadFile(media), {
          contentType: inputMime,
        })
    ).error,
  ).toMatchObject({ status: 400 });
  for (const client of [clients[1], clients[2], anon])
    expect(
      (
        await staging(client).upload(original.staging_path, uploadFile(media), {
          contentType: inputMime,
        })
      ).error,
    ).toMatchObject({ status: 400 });
  expect(
    (
      await staging(clients[0]).upload(
        original.staging_path,
        uploadFile(media),
        {
          contentType: inputMime,
          upsert: false,
        },
      )
    ).error,
  ).toBeNull();
  expect(
    (
      await staging(clients[0]).upload(
        original.staging_path,
        uploadFile(Buffer.from("replacement")),
        { contentType: inputMime, upsert: true },
      )
    ).error,
  ).toMatchObject({ status: 400 });
  expect(
    (await staging(clients[0]).download(original.staging_path)).error,
  ).toMatchObject({ status: 400 });

  // Only the owner finalizes, and only through the v2 registry.
  expect(
    (await post("read", { mediaId: original.id, garden: "v2" })).status,
  ).toBe(403);
  expect(
    (await post("finalize", { mediaId: original.id, garden: "v2" }, 1)).status,
  ).toBe(403);
  expect((await post("finalize", { mediaId: original.id })).status).toBe(403);
  const done = await post("finalize", { mediaId: original.id, garden: "v2" });
  expect(done.status).toBe(200);
  expect(done.data.status).toBe("submitted");
  const entryId = done.data.entryId;
  expect(
    (await post("finalize", { mediaId: original.id, garden: "v2" })).data,
  ).toEqual(done.data);
  expect(
    sql(
      `select (select count(*) from public.v2_flower_entries)||','||(select status from private.v2_media_uploads where id='${original.id}')||','||(select count(*) from private.media_uploads);`,
    ),
  ).toBe("1,submitted,0");

  // Both members read; legacy routing, outsiders and anonymous callers cannot.
  const signed = await post("read", { mediaId: original.id, garden: "v2" }, 1);
  expect(signed.status).toBe(200);
  expect(signed.cache).toContain("no-store");
  expect(signed.data.expiresIn).toBe(60);
  const stored = Buffer.from(
    await (await fetch(signed.data.url)).arrayBuffer(),
  );
  if (audio) {
    expect(signed.data.mimeType).toBe("audio/wav");
    expect(stored.toString("ascii", 0, 4)).toBe("RIFF");
    expect(stored.length).toBe(signed.data.samples * 2 + 44);
  } else {
    const metadata = await sharp(stored).metadata();
    expect([
      metadata.width,
      metadata.height,
      metadata.exif,
      metadata.orientation,
    ]).toEqual([signed.data.width, signed.data.height, undefined, undefined]);
  }
  expect(
    (await post("read", { mediaId: original.id, garden: "v2" })).status,
  ).toBe(200);
  expect((await post("read", { mediaId: original.id })).status).toBe(403);
  expect(
    (await post("read", { mediaId: original.id, garden: "legacy" })).status,
  ).toBe(403);
  expect(
    (await post("read", { mediaId: original.id, garden: "v2" }, 2)).status,
  ).toBe(403);
  expect(
    (await post("read", { mediaId: original.id, garden: "v2" }, null)).status,
  ).toBe(401);
  expect(
    (await post("read", { mediaId: randomUUID(), garden: "v2" })).status,
  ).toBe(403);
  for (const client of [...clients, anon]) {
    expect(
      (await final(client).download(original.final_path)).error,
    ).toMatchObject({ status: 400 });
    expect(
      (await final(client).createSignedUrl(original.final_path, 60)).error,
    ).toMatchObject({ status: 400 });
    expect(
      (
        await final(client).upload(original.final_path, uploadFile(media), {
          contentType: inputMime,
          upsert: true,
        })
      ).error,
    ).toMatchObject({ status: 400 });
    const listing = await final(client).list();
    expect(listing.error).toBeNull();
    expect(listing.data).toEqual([]);
  }

  // Replacement keeps the original post time and retires the old reference.
  const originalTime = sql(
    `select original_posted_at from public.v2_flower_entries where id=${entryId};`,
  );
  const replacement = await intent(0, entryId);
  expect(
    (
      await staging(clients[0]).upload(
        replacement.staging_path,
        uploadFile(media),
        {
          contentType: inputMime,
        },
      )
    ).error,
  ).toBeNull();
  expect(
    (await post("finalize", { mediaId: replacement.id, garden: "v2" })).status,
  ).toBe(200);
  expect(
    sql(
      `select original_posted_at from public.v2_flower_entries where id=${entryId};`,
    ),
  ).toBe(originalTime);
  expect(
    (await post("read", { mediaId: original.id, garden: "v2" }, 1)).status,
  ).toBe(403);
  expect(
    (await post("read", { mediaId: replacement.id, garden: "v2" }, 1)).status,
  ).toBe(200);

  // Cleanup sweeps only the v2 registry and buckets, and cannot be undone by
  // an expired capability.
  const abandoned = await intent(1);
  expect(
    (
      await staging(clients[1]).upload(
        abandoned.staging_path,
        uploadFile(media),
        {
          contentType: inputMime,
        },
      )
    ).error,
  ).toBeNull();
  sql(
    `update private.v2_media_uploads set expires_at=clock_timestamp()-interval '2 hours' where id='${abandoned.id}';`,
  );
  expect((await post("cleanup", {})).data).toEqual({ cleaned: 0 });
  expect(
    sql(
      `select count(*) from storage.objects where bucket_id='garden-v2-staging' and name='${abandoned.staging_path}';`,
    ),
  ).toBe("1");
  expect((await post("cleanup", { garden: "v2" })).status).toBe(200);
  expect(
    (
      await trusted.storage
        .from("garden-v2-staging")
        .download(abandoned.staging_path)
    ).error,
  ).toMatchObject({ status: 400 });
  expect((await trusted.rpc("v2_media_cleanup_candidates")).data).toEqual([]);
  expect(
    (
      await staging(clients[1]).upload(
        abandoned.staging_path,
        uploadFile(media),
        {
          contentType: inputMime,
        },
      )
    ).error,
  ).toMatchObject({ status: 400 });
  expect(
    (
      await trusted.storage
        .from("garden-v2-media")
        .download(replacement.final_path)
    ).error,
  ).toBeNull();
  expect(
    sql(
      `select count(*) from storage.objects where bucket_id in ('garden-staging','garden-media');`,
    ),
  ).toBe("0");

  // Revocation blocks new reads immediately.
  sql("update private.garden_members set revoked_at=now() where member_id=2;");
  expect(
    (await post("read", { mediaId: replacement.id, garden: "v2" }, 1)).status,
  ).toBe(403);
  sql("update private.garden_members set revoked_at=null where member_id=2;");
  expect(
    (await post("read", { mediaId: replacement.id, garden: "v2" }, 1)).status,
  ).toBe(200);
}

// Deletes only the v2 rows created by this previously empty local fixture.
export const v2MediaCleanupSql =
  "delete from private.v2_media_uploads; delete from public.v2_entry_replies; delete from public.v2_flower_entries; delete from public.v2_daisy_assignments; delete from public.v2_flower_day_facts; delete from public.v2_before_noon_snapshots; delete from public.v2_garden_days; delete from public.v2_flowers; delete from public.v2_garden;";
