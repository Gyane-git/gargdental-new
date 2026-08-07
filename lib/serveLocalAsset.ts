import { readFile, stat } from "fs/promises";
import path from "path";

const CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

export async function serveLocalAsset(baseDir: string, slug: string[]) {
  const root = path.resolve(baseDir);
  const resolved = path.resolve(root, ...slug);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) {
      return new Response("Not Found", { status: 404 });
    }

    const data = await readFile(resolved);
    const contentType = CONTENT_TYPES[path.extname(resolved).toLowerCase()] || "application/octet-stream";

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=2592000, immutable",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
