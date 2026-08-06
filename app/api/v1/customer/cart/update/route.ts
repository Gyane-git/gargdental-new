import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getCart, getCartItems, serializeBareCart } from "@/lib/cartLogic";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports CartController::update_cart (CartController.php:538-594). Only `subtotal` is recomputed
// here (tax/shipping_cost_total/shipping_cost are untouched, so they stay Decimal-string, unlike
// add_to_cart which recomputes all three) - see lib/cartLogic.ts's top comment.
/**
 * @swagger
 * /api/v1/customer/cart/update:
 *   post:
 *     summary: Update the quantity of a single item in the authenticated customer's cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [item_id, quantity]
 *             properties:
 *               item_id: { type: integer, description: "cart_items.id; must reference an existing row." }
 *               quantity: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Cart item updated. Only subtotal is recomputed here (tax/shipping_cost_total/shipping_cost are left as-is).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Cart item updated." }
 *                 cart:
 *                   type: object
 *                   description: Bare cart (no nested product data) with recomputed subtotal.
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
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { item_id, quantity } = body as { item_id?: number; quantity?: number };

  const fieldErrors: Record<string, string> = {};
  if (!Number.isInteger(item_id)) fieldErrors.item_id = "The item_id is required.";
  else if (!(await prisma.cart_items.findUnique({ where: { id: BigInt(item_id as number) } }))) {
    fieldErrors.item_id = "The specified item_id does not exist.";
  }
  if (!Number.isInteger(quantity) || (quantity as number) < 1) fieldErrors.quantity = "The quantity must be at least 1.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    const cartRow = await getCart(auth.id);
    if (!cartRow) throw new Error("No cart found");

    const cartItem = await prisma.cart_items.findUnique({ where: { id: BigInt(item_id as number) } });
    if (cartItem) {
      await prisma.cart_items.update({
        where: { id: cartItem.id },
        data: { quantity: quantity as number, updated_at: nowForDb() },
      });
    }

    const items = await getCartItems(cartRow.id); // re-fetched after the update above
    let subtotal = 0;
    for (const item of items) {
      const product = await prisma.products.findFirst({ where: { product_code: item.product_code } });
      if (product) subtotal += Number(item.quantity) * Number(product.sell_price);
    }
    await prisma.cart.update({ where: { id: cartRow.id }, data: { subtotal } });

    const finalCart = await prisma.cart.findUniqueOrThrow({ where: { id: cartRow.id } });
    return successResponse("Cart item updated.", {
      cart: { ...serializeBareCart(finalCart, items), subtotal },
    });
  } catch (error) {
    console.error("Cart update failed", error);
    return serverErrorResponse("Failed to update cart.", error);
  }
}
