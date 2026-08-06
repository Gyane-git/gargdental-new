import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports WishlistController::remove_wishlist_item (WishlistController.php:156-181).
/**
 * @swagger
 * /api/v1/customer/wishlist/remove-item:
 *   delete:
 *     summary: Remove one item from the authenticated customer's wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [item_id]
 *             properties:
 *               item_id:
 *                 type: integer
 *                 description: wishlist.id (must belong to the authenticated customer).
 *     responses:
 *       200:
 *         description: Removed from wishlist.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Removed from wishlist." }
 *       401:
 *         description: Missing/invalid customer bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: item_id missing from the request body.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       404:
 *         description: item_id doesn't match a wishlist row owned by this customer.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { item_id } = body as { item_id?: number };

  if (item_id === undefined || item_id === null) {
    return validationErrorResponse({ item_id: "The item id field is required." });
  }

  try {
    const wishlistItem = await prisma.wishlist.findFirst({ where: { id: BigInt(item_id), customer_id: auth.id } });
    if (wishlistItem) {
      await prisma.wishlist.delete({ where: { id: wishlistItem.id } });
      return successResponse("Removed from wishlist.");
    }
    return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  } catch (error) {
    return serverErrorResponse("Failed to remove wishlist item.", error);
  }
}
