import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getCart, getCartItems, serializeBareCart } from "@/lib/cartLogic";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports CartController::remove_cart (CartController.php:483-503). Note: like get_carts, this
// fatals (uncaught TypeError on `$cart->id` if $cart is null) for a customer with no cart -
// same dead-code-path pattern as get_carts/get_recommended/get-valley-wise-address, so we
// don't replicate the crash: a customer with no cart just gets an already-empty cart back.
/**
 * @swagger
 * /api/v1/customer/cart/remove:
 *   delete:
 *     summary: Clear the authenticated customer's entire cart (all items, totals reset to 0)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared. `cart` is null when the customer had no cart to begin with.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Cart cleared." }
 *                 cart:
 *                   type: object
 *                   nullable: true
 *                   description: Bare cart (no items) with subtotal/tax/shipping_cost_total all 0.
 *       401:
 *         description: Missing or invalid bearer token.
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
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const cartRow = await getCart(auth.id);
    if (!cartRow) {
      return successResponse("Cart cleared.", { cart: null });
    }

    await prisma.cart_items.deleteMany({ where: { cart_id: cartRow.id } });
    await prisma.cart.update({
      where: { id: cartRow.id },
      data: { subtotal: 0, tax: 0, shipping_cost_total: 0 },
    });

    const finalCart = await prisma.cart.findUniqueOrThrow({ where: { id: cartRow.id } });
    const finalItems = await getCartItems(cartRow.id);
    return successResponse("Cart cleared.", {
      cart: { ...serializeBareCart(finalCart, finalItems), subtotal: 0, tax: 0, shipping_cost_total: 0 },
    });
  } catch (error) {
    console.error("Cart clear failed", error);
    return serverErrorResponse("Failed to clear cart.", error);
  }
}
