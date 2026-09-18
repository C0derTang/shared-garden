import { requireMember } from "@/lib/auth/server";
import {
  exactFields,
  mediaFailure,
  mediaJson,
  readMediaRequest,
  uuid,
} from "@/lib/media/http";
import { finalizePhoto } from "@/lib/media/server";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const { client } = await requireMember();
  try {
    const body = await readMediaRequest(request);
    exactFields(body, ["mediaId"]);
    return mediaJson(await finalizePhoto(client, uuid(body.mediaId)));
  } catch (error) {
    return mediaFailure(error);
  }
}
