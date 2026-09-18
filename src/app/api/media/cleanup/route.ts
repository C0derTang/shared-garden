import { requireMember } from "@/lib/auth/server";
import {
  exactFields,
  mediaFailure,
  mediaJson,
  readMediaRequest,
} from "@/lib/media/http";
import { cleanupMedia } from "@/lib/media/server";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  await requireMember();
  try {
    exactFields(await readMediaRequest(request), []);
    return mediaJson(await cleanupMedia());
  } catch (error) {
    return mediaFailure(error);
  }
}
