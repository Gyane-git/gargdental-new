import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";
import { serializeProduct } from "@/lib/productSerializer";
import { getWishlistProductCodes, computeStartingPrice, isWishlisted } from "@/lib/productListHelpers";
import { getCategoryAndDescendantIds } from "@/lib/categoryHelpers";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports ProductController::get_products_by_category (ProductController.php:383-441). Unlike
// /products/category/{categoryId} and /products/all, limit/offset/category_id are REQUIRED here.
/**
 * @swagger
 * /api/v1/products/category-wise-products:
 *   get:
 *     summary: List active top-level products in a category and its descendants (limit/offset/category_id all required)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: query
 *         name: category_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: categories.id
 *       - in: query
 *         name: limit
 *         required: true
 *         schema:
 *           type: integer
 *         description: Max rows to return.
 *       - in: query
 *         name: offset
 *         required: true
 *         schema:
 *           type: integer
 *         description: Rows to skip.
 *     responses:
 *       200:
 *         description: Products fetched successfully, including matches from subcategories. `is_wishlisted` is personalized when a valid bearer token is sent, and false/unpersonalized for anonymous requests.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Category wise products fetched successfully" }
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Serialized product (lib/productSerializer.ts) plus starting_price and is_wishlisted.
 *       403:
 *         description: category_id/limit/offset missing or not a valid integer, or category_id doesn't match an existing category.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("category_id");
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");

  const fieldErrors: Record<string, string> = {};
  if (!categoryId) fieldErrors.category_id = "The category id field is required.";
  else if (!(await prisma.categories.findUnique({ where: { id: BigInt(categoryId) } }))) {
    fieldErrors.category_id = "The selected category id is invalid.";
  }
  if (!limit || !/^-?\d+$/.test(limit)) fieldErrors.limit = "The limit field is required.";
  if (!offset || !/^-?\d+$/.test(offset)) fieldErrors.offset = "The offset field is required.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    const user = await optionalAuth(req);
    const wishlistCodes = await getWishlistProductCodes(user?.id);
    const categoryIds = await getCategoryAndDescendantIds(Number(categoryId));

    const rows = await prisma.products.findMany({
      where: { status: 1, parent_id: null, category_id: { in: categoryIds } },
      skip: Number(offset),
      take: Number(limit),
    });

    const products = await Promise.all(
      rows.map(async (row) => ({
        ...(await serializeProduct(row, { withCategory: true, withBrand: true, withVariations: true })),
        starting_price: await computeStartingPrice(row),
        is_wishlisted: isWishlisted(row.product_code, wishlistCodes),
      })),
    );

    return successResponse("Category wise products fetched successfully", { products });
  } catch (error) {
    console.error("Exception occurred while fetching products", error);
    return serverErrorResponse("Failed to get products", error);
  }
}
