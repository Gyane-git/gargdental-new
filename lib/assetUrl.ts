import { existsSync } from "fs";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";

const normalizeStoredPath = (value: string): string => {
  let raw = String(value || "")
    .trim()
    .replace(/\\/g, "/");
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

  const normalizedFolder = String(folder || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  const candidates = new Set<string>();

  candidates.add(normalizedValue);
  if (normalizedFolder) {
    candidates.add(`${normalizedFolder}/${path.basename(normalizedValue)}`);
  }

  const relativePath = [...candidates].find((candidate) =>
    fileExistsOnDisk(candidate),
  );
  if (!relativePath) {
    return null;
  }

  // Use same-origin paths so production does not depend on a matching NEXT_PUBLIC_APP_URL.
  // Next/Image and regular <img> tags can resolve these URLs on whatever host serves the app.
  return `/storage/${relativePath}`;
};
