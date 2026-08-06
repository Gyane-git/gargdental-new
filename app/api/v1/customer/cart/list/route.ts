import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getCart, getCartItems, serializeCartItemsWithProduct } from "@/lib/cartLogic";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports CartController::get_carts (CartController.php:56-103): after loading the cart with
// nested product data, Laravel overrides each item's displayed `price` to the product's CURRENT
// sell_price if they differ - a response-only override, never persisted to cart_items.
/**
 * @swagger
 * /api/v1/customer/cart/list:
 *   get:
 *     summary: Get the authenticated customer's cart with items (nested product data, live sell_price)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart fetched successfully. `cart` is null when the customer has no cart yet.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Cart fetched successfully." }
 *                 cart:
 *                   type: object
 *                   nullable: true
 *                   description: Cart row plus items[], each item including nested product data and price overridden to the product's current sell_price when they differ.
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
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const cartRow = await getCart(auth.id);
    if (!cartRow) {
      return successResponse("Cart fetched successfully.", { cart: null });
    }

    const items = await getCartItems(cartRow.id);
    const serializedItems = await serializeCartItemsWithProduct(items);

    const withLivePrice = await Promise.all(
      serializedItems.map(async (item) => {
        if (!item.product) return item;
        const latestPrice = await prisma.products.findFirst({
          where: { product_code: item.product_code },
          select: { sell_price: true },
        });
        if (latestPrice && Number(item.price) !== Number(latestPrice.sell_price)) {
          return { ...item, price: latestPrice.sell_price };
        }
        return item;
      }),
    );

    return successResponse("Cart fetched successfully.", {
      cart: { ...cartRow, items: withLivePrice },
    });
  } catch (error) {
    console.error("Exception occurred while fetching cart items", error);
    return serverErrorResponse("Failed to get cart items", error);
  }
}
