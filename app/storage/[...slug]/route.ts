import { serveLocalAsset } from "@/lib/serveLocalAsset";
import { mediaStoragePath } from "@/lib/mediaStorage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: { slug: string[] } }) {
  const params = await Promise.resolve(context.params);
  return serveLocalAsset(mediaStoragePath(), params.slug || []);
}
