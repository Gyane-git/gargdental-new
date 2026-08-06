import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getCart, getCartItems, serializeBareCart, getDefaultShippingAddress, updateCartTotals } from "@/lib/cartLogic";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports CartController::remove_cart_item (CartController.php:427-465).
/**
 * @swagger
 * /api/v1/customer/cart/remove-item:
 *   delete:
 *     summary: Remove a single item from the authenticated customer's cart
 *     tags: [Cart]
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
 *               item_id: { type: integer, description: "cart_items.id of the row to remove." }
 *     responses:
 *       200:
 *         description: Item successfully removed (a no-op item_id that doesn't match any cart item is silently ignored).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Item successfully removed." }
 *                 cart:
 *                   type: object
 *                   description: Bare cart (no nested product data) with recomputed subtotal/tax/shipping_cost_total.
 *       401:
 *         description: Missing or invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: Validation errors.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       500:
 *         description: Unexpected server error (also returned when the customer has no cart at all).
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
    const address = await getDefaultShippingAddress(auth.id);
    const cartRow = await getCart(auth.id);

    if (cartRow) {
      const items = await getCartItems(cartRow.id);
      const cartItem = items.find((i) => i.id === BigInt(item_id));
      if (cartItem) {
        await prisma.cart_items.delete({ where: { id: cartItem.id } });
        await updateCartTotals(cartRow.id, address);
      }
    }

    if (!cartRow) throw new Error("No cart found");

    const finalCart = await prisma.cart.findUniqueOrThrow({ where: { id: cartRow.id } });
    const finalItems = await getCartItems(cartRow.id);
    return successResponse("Item successfully removed.", {
      cart: {
        ...serializeBareCart(finalCart, finalItems),
        subtotal: Number(finalCart.subtotal),
        tax: Number(finalCart.tax),
        shipping_cost_total: Number(finalCart.shipping_cost_total),
      },
    });
  } catch (error) {
    console.error("Cart item removal failed", error);
    return serverErrorResponse("Failed to remove item from cart.", error);
  }
}
