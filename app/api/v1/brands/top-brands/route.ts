import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports BrandController::get_top_brands (BrandController.php:66-80): orderByRaw('ISNULL(order_wise),
// order_wise ASC') - nulls last, then ascending. Prisma's `nulls: 'last'` orderBy option isn't
// supported for MySQL, so sorted in JS instead (brand lists are small).
/**
 * @swagger
 * /api/v1/brands/top-brands:
 *   get:
 *     summary: List active brands flagged as "top", sorted by order_wise (nulls last)
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: Brands fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Brands fetched sucecssfully." }
 *                 brands:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw brands row plus image_full_url.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */

export async function GET() {
  try {
    // Get active top brands
    const rows = await prisma.brands.findMany({
      where: {
        status: 1,
        top: 1,
      },
    });

    const products = await prisma.products.findMany({
      where: {
        brand_id: {
          not: null,
        },
        status: 1,
      },
      select: {
        brand_id: true,
      },
      distinct: ["brand_id"],
    });
    const productBrandIds = new Set(products.map((product) => product.brand_id).filter((id): id is number => id !== null));

    // Keep only brands that have at least one product
    const brandsWithProducts = rows.filter((brand) => productBrandIds.has(brand.id));

    // Sort by order_wise, nulls last
    brandsWithProducts.sort((a, b) => {
      if (a.order_wise === null && b.order_wise === null) return 0;
      if (a.order_wise === null) return 1;
      if (b.order_wise === null) return -1;

      return a.order_wise - b.order_wise;
    });

    const brands = brandsWithProducts.map((row) => ({
      ...row,
      image_full_url: assetUrl(row.image, "backend/brands"),
    }));

    return successResponse("Brands fetched sucecssfully.", { brands });
  } catch (error) {
    console.error("Exception occurred while fetching brands", error);

    return serverErrorResponse("Failed to get brands", error);
  }
}
