import { requireMember } from "@/lib/auth/server";
import {
  exactFields,
  mediaFailure,
  mediaGarden,
  mediaJson,
  readMediaRequest,
  uuid,
} from "@/lib/media/http";
import { finalizeMedia } from "@/lib/media/server";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request) {
  const { client } = await requireMember();
  try {
    const body = await readMediaRequest(request);
    exactFields(body, ["mediaId", "garden"]);
    return mediaJson(
      await finalizeMedia(client, uuid(body.mediaId), mediaGarden(body.garden)),
    );
  } catch (error) {
    return mediaFailure(error);
  }
}
