import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";
import { serializeProduct } from "@/lib/productSerializer";
import { getWishlistProductCodes, isWishlisted } from "@/lib/productListHelpers";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports ProductController::get_searched_products (ProductController.php:697-746). Note: no
// category/brand/variations eager-loaded here (unlike every other list endpoint) so those keys
// are omitted from each product entirely; no starting_price either; total_size is just
// count() on the already-fetched (unpaginated) result set, replicated as-is.
/**
 * @swagger
 * /api/v1/products/search:
 *   get:
 *     summary: Search active top-level products by (space-split, case-insensitive-contains) keywords in product_name
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Search text, split on spaces and OR-matched against product_name via "contains".
 *     responses:
 *       200:
 *         description: >
 *           Searched products fetched successfully. Unlike other list endpoints, no category/brand/
 *           variations are eager-loaded and no starting_price is added. `is_wishlisted` is
 *           personalized when a valid bearer token is sent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Searched products fetched successfully." }
 *                 products:
 *                   type: object
 *                   properties:
 *                     total_size: { type: integer, description: "Count of the (unpaginated) matched rows." }
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: Serialized product (lib/productSerializer.ts) plus is_wishlisted.
 *       403:
 *         description: name query param missing.
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
  const name = searchParams.get("name");

  if (!name) {
    return validationErrorResponse({ name: "The name field is required." });
  }

  try {
    const user = await optionalAuth(req);
    const wishlistCodes = await getWishlistProductCodes(user?.id);

    const stripped = name.replace(/<[^>]*>/g, "").trim();
    const keywords = stripped && stripped !== "null" ? stripped.split(" ").filter(Boolean) : null;

    const rows = await prisma.products.findMany({
      where: {
        status: 1,
        parent_id: null,
        ...(keywords && keywords.length > 0
          ? { OR: keywords.map((word) => ({ product_name: { contains: word } })) }
          : {}),
      },
    });

    const products = await Promise.all(
      rows.map(async (row) => ({
        ...(await serializeProduct(row, {})),
        is_wishlisted: isWishlisted(row.product_code, wishlistCodes),
      })),
    );

    return successResponse("Searched products fetched successfully.", {
      products: { total_size: products.length, products },
    });
  } catch (error) {
    console.error("Exception occurred while fetching search products", error);
    return serverErrorResponse("Failed to get search products", error);
  }
}
