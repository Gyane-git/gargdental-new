// import { prisma } from "@/lib/prisma";
// import { assetUrl } from "@/lib/assetUrl";
// import type { categories } from "@prisma/client";

// export function shouldReturnFlatCategories(req: { url: string; headers: { get(name: string): string | null } }): boolean {
//   const url = new URL(req.url);
//   const referer = req.headers.get("referer") || "";
//   return url.searchParams.get("flat") === "1" || referer.includes("/admin");
// }

// export function formatCategoryRows(rows: categories[]) {
//   return rows.map((row) => ({
//     ...row,
//     image_full_url: assetUrl(row.image, "backend/categories"),
//     image_url: assetUrl(row.image, "backend/categories"),
//   }));
// }

// export function buildCategoryTree(rows: categories[], { onlyActive = true }: { onlyActive?: boolean } = {}) {
//   const filtered = onlyActive ? rows.filter((r) => r.status === 1) : rows;
//   const byId = new Map<number, Record<string, unknown>>();
//   const tree: Record<string, unknown>[] = [];

//   filtered.forEach((row) => {
//     byId.set(Number(row.id), { ...row, active_children: [], children: [] });
//   });

//   filtered.forEach((row) => {
//     const node = byId.get(Number(row.id))!;
//     const parentId = row.parent_id == null ? null : Number(row.parent_id);
//     const parent = parentId ? byId.get(parentId) : null;

//     if (parent) {
//       (parent.active_children as unknown[]).push(node);
//       (parent.children as unknown[]).push(node);
//     } else {
//       tree.push(node);
//     }
//   });

//   return tree;
// }

// export async function serializeCategoryWithActiveChildren(categoryId: bigint): Promise<Record<string, unknown> | null> {
//   const row = await prisma.categories.findUnique({ where: { id: categoryId } });
//   if (!row) return null;

//   const children = await prisma.categories.findMany({
//     where: { parent_id: categoryId, status: 1 },
//   });

//   const activeChildren = await Promise.all(children.map((child) => serializeCategoryWithActiveChildren(child.id)));

//   return {
//     ...row,
//     image_full_url: assetUrl(row.image, "backend/categories"),
//     activeChildren: activeChildren.filter(Boolean),
//   };
// }

import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import type { categories } from "@prisma/client";

// Synchronous variant for admin tooling
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
    byId.set(Number(row.id), {
      ...row,
      active_children: [],
      children: [],
    });
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

/**
 * Build category tree containing only branches that have products.
 *
 * A category is kept when:
 * - the category itself has at least one product, OR
 * - any descendant category has at least one product.
 */
function buildProductCategoryTree(rows: categories[], productCategoryIds: Set<number>) {
  const childrenMap = new Map<number | null, categories[]>();

  for (const row of rows) {
    const parentId = row.parent_id == null ? null : Number(row.parent_id);

    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }

    childrenMap.get(parentId)!.push(row);
  }

  const serializeNode = (row: categories): Record<string, unknown> | null => {
    const children = childrenMap.get(Number(row.id)) || [];

    const serializedChildren = children.map((child) => serializeNode(child)).filter(Boolean) as Record<string, unknown>[];

    const hasOwnProducts = productCategoryIds.has(Number(row.id));

    // Remove this category completely when:
    // it has no products AND none of its children have products.
    if (!hasOwnProducts && serializedChildren.length === 0) {
      return null;
    }

    return {
      ...row,
      image_full_url: assetUrl(row.image, "backend/categories"),
      activeChildren: serializedChildren,
    };
  };

  const topLevel = childrenMap.get(null) || [];

  return topLevel.map((category) => serializeNode(category)).filter(Boolean) as Record<string, unknown>[];
}

/**
 * Fetch top categories with only product-containing branches.
 */
export async function serializeTopCategoriesWithProducts() {
  // Fetch all active categories once.
  const allCategories = await prisma.categories.findMany({
    where: {
      status: 1,
    },
  });

  // Get category IDs used by products.
  const products = await prisma.products.findMany({
    select: {
      category_id: true,
    },
    where: {
      category_id: {
        not: null,
      },
    },
  });

  const productCategoryIds = new Set(products.map((product) => (product.category_id == null ? null : Number(product.category_id))).filter((id): id is number => id !== null));

  const tree = buildProductCategoryTree(allCategories, productCategoryIds);

  // Keep only categories originally marked as top-level categories.
  return tree.filter((category) => {
    const top = Number(category.top);
    const parentId = category.parent_id;

    return top === 1 && parentId == null;
  });
}

/**
 * Existing helper retained for other parts of the application.
 */
export async function serializeCategoryWithActiveChildren(categoryId: bigint): Promise<Record<string, unknown> | null> {
  const row = await prisma.categories.findUnique({
    where: { id: categoryId },
  });

  if (!row) return null;

  const children = await prisma.categories.findMany({
    where: {
      parent_id: categoryId,
      status: 1,
    },
  });

  const activeChildren = await Promise.all(children.map((child) => serializeCategoryWithActiveChildren(child.id)));

  return {
    ...row,
    image_full_url: assetUrl(row.image, "backend/categories"),
    activeChildren: activeChildren.filter(Boolean),
  };
}
