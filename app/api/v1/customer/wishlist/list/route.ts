import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { serializeProduct } from "@/lib/productSerializer";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports WishlistController::get_wishlist (WishlistController.php:32-47).
/**
 * @swagger
 * /api/v1/customer/wishlist/list:
 *   get:
 *     summary: List the authenticated customer's wishlist items with their product details
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist items fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Wishlist items fetched." }
 *                 wishlist:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw wishlist row plus a nested `product` (serialized via lib/productSerializer.ts, or null if the product no longer exists).
 *       401:
 *         description: Missing/invalid customer bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const rows = await prisma.wishlist.findMany({ where: { customer_id: auth.id } });
    const wishlist = await Promise.all(
      rows.map(async (row) => {
        const product = await prisma.products.findFirst({ where: { product_code: row.product_code } });
        return {
          ...row,
          product: product ? await serializeProduct(product, { withCategory: true, withBrand: true, withVariations: true }) : null,
        };
      }),
    );
    return successResponse("Wishlist items fetched.", { wishlist });
  } catch (error) {
    console.error("Exception occurred while fetching wishlist items", error);
    return serverErrorResponse("Failed to get wishlist items", error);
  }
}
