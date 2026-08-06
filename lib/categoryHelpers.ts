import { prisma } from "@/lib/prisma";

// Ports ProductController's private getAllDescendantIds/getAllCategoryIds (ProductController.php:
// 344-355, 444-454) - both recurse over ALL children regardless of active status (no ->active()
// filter, unlike Category::getAllChildCategoryIds) and both endpoints end up wanting
// "self + every descendant id", just built slightly differently in Laravel - one shared
// implementation here covers both call sites.
export async function getCategoryAndDescendantIds(categoryId: number | bigint): Promise<number[]> {
  const ids: number[] = [Number(categoryId)];
  const children = await prisma.categories.findMany({
    where: { parent_id: BigInt(categoryId) },
    select: { id: true },
  });
  for (const child of children) {
    ids.push(...(await getCategoryAndDescendantIds(child.id)));
  }
  return ids;
}
