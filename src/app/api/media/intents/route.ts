import { requireMember } from "@/lib/auth/server";
import {
  checkRpc,
  exactFields,
  mediaFailure,
  mediaJson,
  readMediaRequest,
  uuid,
} from "@/lib/media/http";
import { MediaError } from "@/lib/media/image";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const { client } = await requireMember();
  try {
    const body = await readMediaRequest(request);
    exactFields(body, [
      "requestId",
      "flowerId",
      "mimeType",
      "byteLength",
      "replacementEntryId",
    ]);
    const replacement = body.replacementEntryId ?? null;
    if (
      replacement !== null &&
      (!Number.isSafeInteger(replacement) || (replacement as number) < 1)
    )
      throw new MediaError("invalid_request", 400);
    if (
      typeof body.mimeType !== "string" ||
      !Number.isSafeInteger(body.byteLength)
    )
      throw new MediaError("invalid_request", 400);
    const result = await client.rpc("create_media_upload", {
      p_request_id: uuid(body.requestId),
      p_flower_id: uuid(body.flowerId),
      p_mime_type: body.mimeType,
      p_input_bytes: body.byteLength,
      p_replacement_entry_id: replacement,
    });
    checkRpc(result.error);
    return mediaJson(result.data);
  } catch (error) {
    return mediaFailure(error);
  }
}
