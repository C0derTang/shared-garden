import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { getAuthConfig } from "@/lib/auth/config";
import { getServerConfig } from "@/lib/config/server";
import { checkRpc } from "./http";
import { MediaError, PHOTO_INPUT_LIMIT, sanitizePhoto } from "./image";

type Upload = {
  id: string;
  flower_id: string;
  replacement_entry_id: number | null;
  status: string;
  expires_at: string;
  mime_type: string;
  input_bytes: number;
  staging_path: string;
  final_path: string;
  entry_id: number | null;
  lease_id?: string;
};
function trustedMediaClient() {
  const auth = getAuthConfig();
  const server = getServerConfig();
  if (!auth || server.status !== "ready")
    throw new MediaError("media_unavailable", 503);
  return createClient(auth.supabaseUrl, server.config.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(25_000),
          ]),
        }),
    },
  });
}
export async function finalizePhoto(client: SupabaseClient, id: string) {
  const claim = await client.rpc("claim_media_upload", { p_id: id });
  checkRpc(claim.error);
  const upload = claim.data as Upload;
  if (upload.status === "submitted")
    return { mediaId: id, entryId: upload.entry_id, status: "submitted" };
  if (upload.status !== "ready") {
    const trusted = trustedMediaClient();
    const staged = await trusted.storage
      .from("garden-staging")
      .download(upload.staging_path);
    if (staged.error || !staged.data)
      throw new MediaError("upload_missing", 409);
    if (
      staged.data.size !== upload.input_bytes ||
      staged.data.size > PHOTO_INPUT_LIMIT
    )
      throw new MediaError("photo_size_mismatch");
    const photo = await sanitizePhoto(
      Buffer.from(await staged.data.arrayBuffer()),
      upload.mime_type,
    );
    // Server uses INSERT only too. Crash recovery may encounter its own final
    // object: accept it only if it is byte-for-byte the validated canonical file.
    const stored = await trusted.storage
      .from("garden-media")
      .upload(upload.final_path, photo.bytes, {
        contentType: photo.mimeType,
        cacheControl: "0",
        upsert: false,
      });
    if (stored.error) {
      const existing = await trusted.storage
        .from("garden-media")
        .download(upload.final_path);
      if (
        existing.error ||
        !existing.data ||
        existing.data.size !== photo.bytes.length ||
        createHash("sha256")
          .update(Buffer.from(await existing.data.arrayBuffer()))
          .digest("hex") !== photo.sha256
      )
        throw new MediaError("media_unavailable", 503);
    }
    const attested = await trusted.rpc("attest_media_upload", {
      p_id: id,
      p_lease_id: upload.lease_id,
      p_output_bytes: photo.bytes.length,
      p_width: photo.width,
      p_height: photo.height,
      p_sha256: photo.sha256,
    });
    checkRpc(attested.error);
  }
  const payload = { media_id: id };
  const saved =
    upload.replacement_entry_id === null
      ? await client.rpc("submit_flower_entry", {
          p_flower_id: upload.flower_id,
          p_payload: payload,
        })
      : await client.rpc("edit_flower_entry", {
          p_entry_id: upload.replacement_entry_id,
          p_payload: payload,
        });
  if (saved.error) {
    // A concurrent retry can have committed this same immutable intent. Confirm
    // that fact with the member's session before reporting idempotent success.
    const current = await client.rpc("media_upload_state", { p_id: id });
    if (!current.error && current.data?.status === "submitted")
      return {
        mediaId: id,
        entryId: current.data.entry_id,
        status: "submitted",
      };
    checkRpc(saved.error);
  }
  return { mediaId: id, entryId: saved.data.id, status: "submitted" };
}
export async function readPhoto(client: SupabaseClient, id: string) {
  const allowed = await client.rpc("media_read_path", { p_id: id });
  checkRpc(allowed.error);
  const trusted = trustedMediaClient();
  const signed = await trusted.storage
    .from("garden-media")
    .createSignedUrl(allowed.data.path, 60);
  if (signed.error || !signed.data)
    throw new MediaError("media_unavailable", 503);
  return {
    mediaId: id,
    url: signed.data.signedUrl,
    expiresIn: 60,
    width: allowed.data.width,
    height: allowed.data.height,
    mimeType: allowed.data.mime_type,
  };
}
export async function cleanupMedia() {
  const trusted = trustedMediaClient();
  const candidates = await trusted.rpc("media_cleanup_candidates");
  checkRpc(candidates.error);
  let cleaned = 0;
  for (const item of candidates.data as {
    id: string;
    staging_path: string | null;
    final_path: string | null;
  }[]) {
    let staging = false;
    let final = false;
    if (item.staging_path)
      staging = !(
        await trusted.storage.from("garden-staging").remove([item.staging_path])
      ).error;
    if (item.final_path)
      final = !(
        await trusted.storage.from("garden-media").remove([item.final_path])
      ).error;
    const ack = await trusted.rpc("media_cleanup_done", {
      p_id: item.id,
      p_staging: staging,
      p_final: final,
    });
    checkRpc(ack.error);
    if ((!item.staging_path || staging) && (!item.final_path || final))
      cleaned++;
  }
  return { cleaned };
}
