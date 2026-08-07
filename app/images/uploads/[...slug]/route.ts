import { serveLocalAsset } from "@/lib/serveLocalAsset";
import { resolvePublicPath } from "@/lib/projectPaths";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return serveLocalAsset(resolvePublicPath("images", "uploads"), slug || []);
}
