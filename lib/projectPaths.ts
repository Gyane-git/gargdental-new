import fs from "fs";
import path from "path";

function candidateRoots(): string[] {
  const roots = new Set<string>();
  let current = process.cwd();

  for (let i = 0; i < 6; i++) {
    roots.add(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return [...roots];
}

export function resolveExistingPath(relativePath: string): string | null {
  const normalizedRelative = String(relativePath || "").replace(/^\/+/, "");
  if (!normalizedRelative) return null;

  for (const root of candidateRoots()) {
    const candidate = path.join(root, normalizedRelative);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function resolvePublicPath(...segments: string[]): string {
  const relativePath = path.join("public", ...segments);
  return resolveExistingPath(relativePath) || path.join(process.cwd(), relativePath);
}
