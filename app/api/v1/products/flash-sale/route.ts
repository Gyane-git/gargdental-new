import { NextRequest } from "next/server";
import { optionalAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeProduct } from "@/lib/productSerializer";
import { getWishlistProductCodes, computeStartingPrice, isWishlisted } from "@/lib/productListHelpers";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports ProductController::get_flash_sale_products (ProductController.php:558-608).
/**
 * @swagger
 * /api/v1/products/flash-sale:
 *   get:
 *     summary: List active top-level flash-sale products (limit/offset required)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: true
 *         schema:
 *           type: string
 *         description: Max rows to return.
 *       - in: query
 *         name: offset
 *         required: true
 *         schema:
 *           type: string
 *         description: Rows to skip.
 *     responses:
 *       200:
 *         description: Products fetched successfully. `is_wishlisted` is personalized when a valid bearer token is sent, and false/unpersonalized for anonymous requests.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Flash Sale products fetched successfully" }
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Serialized product (lib/productSerializer.ts) plus starting_price and is_wishlisted.
 *       403:
 *         description: limit/offset missing.
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
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");

  const fieldErrors: Record<string, string> = {};
  if (!limit) fieldErrors.limit = "The limit field is required.";
  if (!offset) fieldErrors.offset = "The offset field is required.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    const user = await optionalAuth(req);
    const wishlistCodes = await getWishlistProductCodes(user?.id);

    const rows = await prisma.products.findMany({
      where: { status: 1, parent_id: null, flash_sale: 1 },
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

    return successResponse("Flash Sale products fetched successfully", { products });
  } catch (error) {
    console.error("Exception occurred while fetching flash sale products", error);
    return serverErrorResponse("Failed to get flash sale products", error);
  }
}
