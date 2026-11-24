import { requireMember } from "@/lib/auth/server";
import {
  exactFields,
  mediaFailure,
  mediaGarden,
  mediaJson,
  readMediaRequest,
} from "@/lib/media/http";
import { cleanupMedia } from "@/lib/media/server";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  await requireMember();
  try {
    const body = await readMediaRequest(request);
    exactFields(body, ["garden"]);
    return mediaJson(await cleanupMedia(mediaGarden(body.garden)));
  } catch (error) {
    return mediaFailure(error);
  }
}
