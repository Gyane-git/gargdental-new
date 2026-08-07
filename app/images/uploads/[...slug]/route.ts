import { serveLocalAsset } from "@/lib/serveLocalAsset";
import path from "path";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: { slug: string[] } }) {
  const params = await Promise.resolve(context.params);
  return serveLocalAsset(path.join(process.cwd(), "public", "images", "uploads"), params.slug || []);
}
