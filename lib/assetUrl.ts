import { existsSync } from "fs";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";

// Stands in for Laravel's Helpers::get_full_url() (app/CentralLogics/Helpers.php:267-307) for
// the 'public' disk case (the vast majority of real content - we don't replicate the per-file
// 's3' disk tracking via the `storages` polymorphic table). On an api/* request (always true
// here, this app IS the API), Laravel returns null when the file doesn't exist on disk, and
// otherwise `{APP_URL}/storage/{path}/{data}` (dynamicStorage() rewrites 'storage/app/public'
// -> 'storage', app/helpers.php:72-82). We replicate both parts exactly:
//  - existence is checked against this project's own public/storage dir (see
//    lib/mediaStorage.ts for why it lives under public/ rather than storage/app/public).
//  - the URL is built with the same /storage/{path}/{data} shape; since public/storage is a
//    real directory, Next.js serves it as a static file with no route handler involved.

const normalizeStoredPath = (value: string): string => {
  let raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = decodeURIComponent(new URL(raw).pathname || "");
    } catch {
      // Keep the original string if it is not a valid URL.
    }
  }

  raw = raw.replace(/^\/+/, "");
  raw = raw.replace(/^public\//, "");
  raw = raw.replace(/^storage\//, "");
  return raw.replace(/\/+/g, "/");
};

const fileExistsOnDisk = (relativePath: string): boolean => {
  try {
    return existsSync(path.join(mediaStoragePath(), relativePath));
  } catch {
    return false;
  }
};

// `folder` mirrors Laravel's get_full_url($path, ...) first argument (e.g. 'backend/compliances').
export const assetUrl = (value: unknown, folder: string): string | null => {
  const normalizedValue = normalizeStoredPath(String(value || ""));
  if (!normalizedValue) return null;

  const normalizedFolder = String(folder || "").trim().replace(/^\/+|\/+$/g, "");
  const candidates = new Set<string>();

  candidates.add(normalizedValue);
  if (normalizedFolder) {
    candidates.add(`${normalizedFolder}/${path.basename(normalizedValue)}`);
  }

  const relativePath = [...candidates].find((candidate) => fileExistsOnDisk(candidate));
  if (!relativePath) {
    return null;
  }

  return `/storage/${relativePath}`;
};
