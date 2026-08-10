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
    // Variations added via the admin edit UI live in `product_variations`, one row per
    // variation, keyed by product_code (this is the same table app/api/v1/products/[id]/route.ts
    // reads from). But that table only ever held 2 unrelated seed rows in the migrated data -
    // every legacy product's real variations are child rows in `products` itself, linked via
    // parent_id (65 of the 66 has_variations=1 products have children this way, 0 have
    // product_variations rows). Prefer product_variations when populated, else fall back to
    // parent_id children so legacy variation data isn't silently dropped.
    const variationRows = await prisma.product_variations.findMany({ where: { product_code: productCode }, orderBy: { id: "asc" } });
    if (variationRows.length > 0) {
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
    } else if (product.parent_id === null) {
      const childRows = await prisma.products.findMany({ where: { parent_id: Number(product.id) }, orderBy: { id: "asc" } });
      // Legacy child products store their own image under the PARENT's productimages folder
      // (mirrors the mainImageProductCode lookup above for the reverse direction). Some newer
      // child rows instead store the full "backend/productimages/{code}/{file}" path directly
      // in main_image - split that back into assetUrl's (filename, folder) shape.
      variations = childRows.map((child) => {
        let childImageFullUrl: string | null = null;
        if (child.main_image) {
          const slashIndex = child.main_image.lastIndexOf("/");
          childImageFullUrl =
            slashIndex >= 0
              ? assetUrl(child.main_image.slice(slashIndex + 1), child.main_image.slice(0, slashIndex))
              : assetUrl(child.main_image, `backend/productimages/${productCode}`);
        }
        const resolvedImage = childImageFullUrl || imageFullUrl;
        return {
          id: Number(child.id),
          product_code: child.product_code,
          product_name: child.product_name,
          actual_price: Number(child.actual_price || 0),
          sell_price: Number(child.sell_price || 0),
          available_quantity: Number(child.available_quantity || 0),
          stock_quantity: Number(child.stock_quantity || 0),
          sku: null,
          attributes: {},
          image_full_url: resolvedImage,
          main_image_full_url: resolvedImage,
        };
      });
    }
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
