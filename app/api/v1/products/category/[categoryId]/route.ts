import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";
import { serializeProduct } from "@/lib/productSerializer";
import { getWishlistProductCodes, computeStartingPrice, isWishlisted } from "@/lib/productListHelpers";
import { getCategoryAndDescendantIds } from "@/lib/categoryHelpers";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports ProductController::getByCategory (ProductController.php:280-341).
/**
 * @swagger
 * /api/v1/products/category/{categoryId}:
 *   get:
 *     summary: List active top-level products in a category and all of its descendant categories, optionally paginated
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: categories.id
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         required: false
 *         description: Max rows to return. Omit for no limit.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         required: false
 *         description: Rows to skip. Omit for no offset.
 *     responses:
 *       200:
 *         description: Products fetched successfully, including matches from subcategories. `is_wishlisted` is personalized when a valid bearer token is sent, and false/unpersonalized for anonymous requests.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Products retrieved successfully including subcategories" }
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Serialized product (lib/productSerializer.ts) plus starting_price and is_wishlisted.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ categoryId: string }> }) {
  try {
    const { categoryId } = await params;
    const { searchParams } = new URL(req.url);
    const user = await optionalAuth(req);
    const wishlistCodes = await getWishlistProductCodes(user?.id);

    const categoryIds = await getCategoryAndDescendantIds(Number(categoryId));

    const rows = await prisma.products.findMany({
      where: { status: 1, parent_id: null, category_id: { in: categoryIds } },
      ...(searchParams.has("offset") ? { skip: Number(searchParams.get("offset")) } : {}),
      ...(searchParams.has("limit") ? { take: Number(searchParams.get("limit")) } : {}),
    });

    const products = await Promise.all(
      rows.map(async (row) => ({
        ...(await serializeProduct(row, { withCategory: true, withBrand: true, withVariations: true })),
        starting_price: await computeStartingPrice(row),
        is_wishlisted: isWishlisted(row.product_code, wishlistCodes),
      })),
    );

    return successResponse("Products retrieved successfully including subcategories", { products });
  } catch (error) {
    console.error("Category product fetch error", error);
    return serverErrorResponse("Failed to get category products", error);
  }
}
