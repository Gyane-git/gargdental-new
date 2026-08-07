import { serveLocalAsset } from "@/lib/serveLocalAsset";
import path from "path";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return serveLocalAsset(path.join(process.cwd(), "public", "images", "uploads"), slug || []);
}
