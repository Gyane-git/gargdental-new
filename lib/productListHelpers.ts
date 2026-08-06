import { prisma } from "@/lib/prisma";

// Shared helpers repeated across most of ProductController's list endpoints in Laravel:
// $wishlistProductIds = $user ? $user->wishlist()->pluck('products.product_code')->toArray() : [];
// and per-product: starting_price (min sell_price among variations, else own sell_price) +
// is_wishlisted. These are NOT part of Product's own $appends - they're attached dynamically
// only by the specific controller methods that need them, so they live here, not in
// lib/productSerializer.ts.

export async function getWishlistProductCodes(customerId: bigint | number | undefined | null): Promise<string[]> {
  if (!customerId) return [];
  const rows = await prisma.wishlist.findMany({
    where: { customer_id: BigInt(customerId) },
    select: { product_code: true },
  });
  return rows.map((r) => r.product_code);
}

interface MinimalProduct {
  id: bigint;
  product_code: string;
  sell_price: unknown;
  has_variations: number | null;
}

export async function computeStartingPrice(product: MinimalProduct): Promise<unknown> {
  if (!product.has_variations) return product.sell_price;
  const agg = await prisma.products.aggregate({
    where: { parent_id: Number(product.id) },
    _min: { sell_price: true },
  });
  return agg._min.sell_price;
}

export function isWishlisted(productCode: string, wishlistCodes: string[]): boolean {
  return wishlistCodes.includes(productCode);
}
