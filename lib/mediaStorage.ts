import path from "path";

// Single source of truth for where media files live on disk, read by every admin/customer
// upload route and checked for existence by lib/assetUrl.ts.
//
// This now points at public/storage rather than storage/app/public: Next.js serves anything
// under public/ as a plain static file, with no webpack compilation involved. Routing image
// requests through a custom dynamic route (the old app/storage/[...slug]/route.ts) instead
// hit two separate dev-mode-only Next.js bugs on Windows - persistent webpack cache corruption
// (ENOENT renaming .pack.gz_ files) and on-demand-entries recompiling the route out from under
// concurrent in-flight requests (ENOENT opening route.js) - both triggered by the burst of
// concurrent image requests a product grid fires on load. Static files under public/ go
// through neither code path, so both classes of failure are gone by construction.
export function mediaStoragePath(): string {
  return (
    process.env.MEDIA_STORAGE_PATH ||
    process.env.LARAVEL_STORAGE_PATH ||
    path.join(process.cwd(), "public", "storage")
  );
}
