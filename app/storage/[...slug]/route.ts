import { serveLocalAsset } from "@/lib/serveLocalAsset";
import { mediaStoragePath } from "@/lib/mediaStorage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return serveLocalAsset(mediaStoragePath(), slug || []);
}
