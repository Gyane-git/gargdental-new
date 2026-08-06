import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { serializeReview } from "@/lib/reviewSerializer";
import type { products } from "@prisma/client";

// Ports Product's $appends (Product.php:16): files_full_url, main_image_full_url,
// image_full_url, catalogue_full_url, average_rating, review_count, reviews. These are
// ALWAYS present on every serialized product regardless of what the controller eager-loads
// (Laravel computes accessors on serialization) - do not make them conditional.
//
// IMPORTANT: Decimal columns (price/discount/actual_price/sell_price/tax/etc.) must NOT be
// cast to JS numbers - Eloquent's default decimal cast serializes as a numeric STRING
// (e.g. "1500.00"), and Prisma's Decimal fields already stringify the same way via their own
// toJSON(). Passing them through untouched is what matches Laravel; converting to Number()
// would strip trailing zeros and change the JSON type, which is a real incompatibility.

async function computeReviewSet(product: products) {
  if (product.parent_id !== null) return [];

  const variations = await prisma.products.findMany({
    where: { parent_id: Number(product.id) },
    select: { product_code: true },
  });

  if (variations.length > 0) {
    return prisma.product_reviews.findMany({
      where: { product_code: { in: variations.map((v) => v.product_code) } },
    });
  }

  return prisma.product_reviews.findMany({ where: { product_code: product.product_code } });
}

export interface SerializeProductOptions {
  withCategory?: boolean;
  withBrand?: boolean;
  withVariations?: boolean;
}

export async function serializeProduct(product: products, options: SerializeProductOptions = {}) {
  const productCode = product.product_code;

  const productImages = await prisma.product_images.findMany({ where: { product_code: productCode } });
  const filesFullUrl = productImages.map((img) => assetUrl(img.image_path, `backend/productimages/${productCode}`));
  const imageFullUrl = productImages.length > 0 ? assetUrl(productImages[0].image_path, `backend/productimages/${productCode}`) : null;

  let mainImageProductCode = productCode;
  if (product.parent_id) {
    const parent = await prisma.products.findUnique({ where: { id: BigInt(product.parent_id) } });
    if (parent) mainImageProductCode = parent.product_code;
  }
  const mainImageFullUrl =
    mainImageProductCode && product.main_image ? assetUrl(product.main_image, `backend/productimages/${mainImageProductCode}`) : null;

  const catalogueFullUrl = assetUrl(product.product_catalogue, `backend/productcatalogue/${productCode}`);

  const reviewRows = await computeReviewSet(product);
  const reviews = await Promise.all(reviewRows.map(serializeReview));
  const ratings = reviewRows.map((r) => Number(r.rating));
  const averageRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : "0.00";
  const reviewCount = reviewRows.length;

  let category = null;
  if (options.withCategory && product.category_id) {
    const categoryRow = await prisma.categories.findUnique({ where: { id: BigInt(product.category_id) } });
    category = categoryRow
      ? { ...categoryRow, image_full_url: assetUrl(categoryRow.image, "backend/categories") }
      : null;
  }

  let brand = null;
  if (options.withBrand && product.brand_id) {
    const brandRow = await prisma.brands.findUnique({ where: { id: product.brand_id } });
    brand = brandRow ? { ...brandRow, image_full_url: assetUrl(brandRow.image, "backend/brands") } : null;
  }

  let variations: unknown[] = [];
  if (options.withVariations) {
    // Variations are NOT stored as separate rows in `products` linked via parent_id (that column
    // is never populated by the product create/edit routes) - they live in `product_variations`,
    // one row per variation, keyed by product_code. This is the same table
    // app/api/v1/products/[id]/route.ts (admin edit) reads from, so storefront and admin now
    // agree on where variation data comes from.
    const variationRows = await prisma.product_variations.findMany({ where: { product_code: productCode }, orderBy: { id: "asc" } });
    variations = variationRows.map((v) => {
      let attributes: Record<string, unknown> = {};
      try {
        attributes = typeof v.attributes === "string" ? JSON.parse(v.attributes) : (v.attributes as unknown as Record<string, unknown>);
      } catch {
        attributes = {};
      }
      const variationImagePath = typeof attributes.image === "string" ? attributes.image : "";
      const variationImageFullUrl = variationImagePath
        ? assetUrl(variationImagePath, `backend/productimages/${productCode}`)
        : imageFullUrl;
      return {
        id: Number(v.id),
        product_code: v.product_code,
        product_name: (attributes.name as string) || product.product_name,
        actual_price: Number(v.price),
        sell_price: Number((attributes.sell_price as number) ?? v.price ?? 0),
        available_quantity: Number((attributes.available_qty as number) ?? v.stock ?? 0),
        stock_quantity: Number(v.stock),
        sku: v.sku,
        attributes,
        image_full_url: variationImageFullUrl,
        main_image_full_url: variationImageFullUrl,
      };
    });
  }

  return {
    ...product,
    files_full_url: filesFullUrl,
    main_image_full_url: mainImageFullUrl,
    image_full_url: imageFullUrl,
    catalogue_full_url: catalogueFullUrl,
    average_rating: averageRating,
    review_count: reviewCount,
    reviews,
    ...(options.withCategory ? { category } : {}),
    ...(options.withBrand ? { brand } : {}),
    ...(options.withVariations ? { variations } : {}),
  };
}
