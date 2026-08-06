import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validationErrorResponse, successResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports WishlistController::add_to_wishlist (WishlistController.php:81-117).
/**
 * @swagger
 * /api/v1/customer/wishlist/add:
 *   post:
 *     summary: Add a product to the authenticated customer's wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_code]
 *             properties:
 *               product_code:
 *                 type: string
 *                 example: "PROD-001"
 *     responses:
 *       200:
 *         description: >
 *           Added to wishlist, OR already present - both return HTTP 200. When newly added,
 *           `success` is true and `wishlist` is the created row; when already present, `success`
 *           is false and there is no `wishlist` field.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Added to wishlist" }
 *                 wishlist:
 *                   type: object
 *                   description: The created wishlist row (only present when newly added).
 *       401:
 *         description: Missing/invalid customer bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: >
 *           product_code missing from the request body, OR an unexpected exception occurred while
 *           writing to the wishlist (both return this status).
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/ValidationErrorResponse'
 *                 - type: object
 *                   properties:
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           code: { type: string, example: "wishlist" }
 *                           message: { type: string, example: "Exception message" }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { product_code } = body as { product_code?: string };

  if (!product_code) {
    return validationErrorResponse({ product_code: "The product code field is required." });
  }

  try {
    const exists = await prisma.wishlist.findFirst({ where: { customer_id: auth.id, product_code } });
    if (exists) {
      return NextResponse.json({ success: false, message: "Already in wishlist" }, { status: 200 });
    }

    const wishlist = await prisma.wishlist.create({
      data: { customer_id: auth.id, product_code, created_at: nowForDb(), updated_at: nowForDb() },
    });

    return successResponse("Added to wishlist", { wishlist });
  } catch (error) {
    return NextResponse.json(
      { errors: [{ code: "wishlist", message: error instanceof Error ? error.message : String(error) }] },
      { status: 403 },
    );
  }
}
