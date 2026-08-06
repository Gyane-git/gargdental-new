import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import type { categories } from "@prisma/client";

// Synchronous variant for admin tooling (excel-upload templates, image-folder) that already has
// ALL category rows in hand (including inactive ones, unlike serializeCategoryWithActiveChildren
// below which is DB-driven and active-only for the public /categories endpoint). Ports gargnew's
// utils/apiFormatters.js buildCategoryTree().
// Ports gargnew's utils/apiFormatters.js shouldReturnFlatCategories/formatCategoryRows - the
// admin categories page calls the SAME /api/v1/categories endpoint the mobile app uses, and
// gets a flat (not tree) array back either via ?flat=1 or because its own Referer contains
// /admin. The mobile Laravel-compatible {success,message,categories} tree shape is untouched
// either way - this only adds a second response shape for the admin case.
export function shouldReturnFlatCategories(req: { url: string; headers: { get(name: string): string | null } }): boolean {
  const url = new URL(req.url);
  const referer = req.headers.get("referer") || "";
  return url.searchParams.get("flat") === "1" || referer.includes("/admin");
}

export function formatCategoryRows(rows: categories[]) {
  return rows.map((row) => ({
    ...row,
    image_full_url: assetUrl(row.image, "backend/categories"),
    image_url: assetUrl(row.image, "backend/categories"),
  }));
}

export function buildCategoryTree(rows: categories[], { onlyActive = true }: { onlyActive?: boolean } = {}) {
  const filtered = onlyActive ? rows.filter((r) => r.status === 1) : rows;
  const byId = new Map<number, Record<string, unknown>>();
  const tree: Record<string, unknown>[] = [];

  filtered.forEach((row) => {
    byId.set(Number(row.id), { ...row, active_children: [], children: [] });
  });

  filtered.forEach((row) => {
    const node = byId.get(Number(row.id))!;
    const parentId = row.parent_id == null ? null : Number(row.parent_id);
    const parent = parentId ? byId.get(parentId) : null;

    if (parent) {
      (parent.active_children as unknown[]).push(node);
      (parent.children as unknown[]).push(node);
    } else {
      tree.push(node);
    }
  });

  return tree;
}

// Ports Category::activeChildren (Category.php:72-77, always-appended image_full_url at
// Category.php:14-27) - recursively loads only active children, arbitrarily deep. JSON key is
// `activeChildren` (camelCase, matching the Eloquent relation/method name exactly - Laravel does
// not snake_case relation keys).
export async function serializeCategoryWithActiveChildren(categoryId: bigint): Promise<Record<string, unknown> | null> {
  const row = await prisma.categories.findUnique({ where: { id: categoryId } });
  if (!row) return null;

  const children = await prisma.categories.findMany({
    where: { parent_id: categoryId, status: 1 },
  });

  const activeChildren = await Promise.all(children.map((child) => serializeCategoryWithActiveChildren(child.id)));

  return {
    ...row,
    image_full_url: assetUrl(row.image, "backend/categories"),
    activeChildren: activeChildren.filter(Boolean),
  };
}
