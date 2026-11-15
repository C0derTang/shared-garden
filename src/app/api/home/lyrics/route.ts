import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createRequestClient, noStore } from "@/lib/auth/client";
import { getAuthConfig } from "@/lib/auth/config";
import { verifyMember } from "@/lib/auth/member";
import { parseLyrics } from "@/lib/landing/lyrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const maxBytes = 256 * 1024;
const empty = (status: number) => noStore(new NextResponse(null, { status }));

async function localLyrics() {
  const configured = process.env.SUNSET_LYRICS_PATH?.trim();
  if (!configured || !path.isAbsolute(configured) || path.extname(configured).toLowerCase() !== ".json") return empty(503);
  const publicRoot = path.resolve(process.cwd(), "public");
  const isPublic = (value: string) => value === publicRoot || value.startsWith(`${publicRoot}${path.sep}`);
  if (isPublic(path.resolve(configured)) || isPublic(await realpath(configured))) return empty(503);
  const file = await open(configured, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size <= 0 || info.size > maxBytes) return empty(503);
    // Bound reads even if the privately configured file grows after stat.
    const bytes = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maxBytes) return empty(503);
    const lyrics = parseLyrics(JSON.parse(bytes.subarray(0, length).toString("utf8")));
    if (!lyrics) return empty(503);
    return NextResponse.json(lyrics, { headers: {
      "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } finally { await file.close().catch(() => {}); }
}

export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  if (!config) return empty(503);
  let auth: ReturnType<typeof createRequestClient> | undefined;
  try {
    auth = createRequestClient(request, config);
    const access = await verifyMember(auth.client);
    if (access.status !== "allowed") return auth.finish(empty(
      access.status === "signin" ? 401 : access.status === "denied" ? 403 : 503,
    ));
    return auth.finish(await localLyrics());
  } catch {
    return auth ? auth.finish(empty(503)) : empty(503);
  }
}
