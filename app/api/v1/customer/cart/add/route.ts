import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  getCart,
  getCartItems,
  serializeBareCart,
  getDefaultShippingAddress,
  updateCartShippingCost,
  updateCartTotals,
} from "@/lib/cartLogic";
import { validationErrorResponse, successResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports CartController::add_to_cart (CartController.php:236-342). Note: "already in cart" is
// success:false but HTTP 200 (not an error status) - a real Laravel quirk, replicated as-is.
// The final cart->load('items') means the response's items[] have NO nested product data
// (only get_carts shows that) - see lib/cartLogic.ts's top comment for the numeric-type quirk
// on subtotal/tax/shipping_cost_total.
/**
 * @swagger
 * /api/v1/customer/cart/add:
 *   post:
 *     summary: Add a product to the authenticated customer's cart (or return an "already in cart" notice)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_code, price, quantity]
 *             properties:
 *               product_code: { type: string, description: "Must reference an existing product." }
 *               price: { type: number }
 *               quantity: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Added to cart successfully, or the item was already in the cart (still HTTP 200, `success:false`, matching a Laravel quirk).
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean, example: true }
 *                     message: { type: string, example: "Added to cart successfully!" }
 *                     cart:
 *                       type: object
 *                       description: Bare cart (no nested product data) plus subtotal, tax, shipping_cost_total.
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean, example: false }
 *                     message: { type: string, example: "This item is already added in your cart!" }
 *       401:
 *         description: Missing or invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: Field validation errors (standard envelope), OR a cart-item business rule violation (out of stock, insufficient quantity, product not found) with a different inline shape (no top-level success/message).
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
 *                           code: { type: string, example: "cart_item" }
 *                           message: { type: string, example: "Out of stock" }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { product_code, price, quantity } = body as { product_code?: string; price?: number; quantity?: number };

  const fieldErrors: Record<string, string> = {};
  if (!product_code) fieldErrors.product_code = "The product code field is required.";
  else if (!(await prisma.products.findFirst({ where: { product_code } }))) {
    fieldErrors.product_code = "The selected product code is invalid.";
  }
  if (price === undefined || price === null || Number.isNaN(Number(price))) fieldErrors.price = "The price field must be a number.";
  if (!Number.isInteger(quantity) || (quantity as number) < 1) fieldErrors.quantity = "The quantity field must be at least 1.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    const product = await prisma.products.findFirst({ where: { product_code } });
    if (!product) throw new Error("Product not found");
    if (product.available_quantity < 1) throw new Error("Out of stock");
    if ((quantity as number) > product.available_quantity) throw new Error("Please select less than available quantity.");

    let cartRow = await getCart(auth.id);
    const existingItems = cartRow ? await getCartItems(cartRow.id) : [];
    const alreadyExists = existingItems.some((item) => item.product_code === product_code);

    if (!alreadyExists) {
      if (!cartRow) {
        cartRow = await prisma.cart.create({
          data: {
            customer_id: auth.id,
            province_id: null,
            city_id: null,
            tax: 0,
            shipping_cost: 0,
            subtotal: 0,
            created_at: nowForDb(),
            updated_at: nowForDb(),
          },
        });
      }

      await prisma.cart_items.create({
        data: {
          cart_id: cartRow.id,
          product_code: product_code as string,
          quantity: quantity as number,
          price: price as number,
          created_at: nowForDb(),
          updated_at: nowForDb(),
        },
      });

      // Sync all items' prices to their product's current sell_price.
      const items = await getCartItems(cartRow.id);
      for (const item of items) {
        const itemProduct = await prisma.products.findFirst({ where: { product_code: item.product_code } });
        if (itemProduct?.sell_price != null && Number(item.price) !== Number(itemProduct.sell_price)) {
          await prisma.cart_items.update({ where: { id: item.id }, data: { price: itemProduct.sell_price } });
        }
      }

      await prisma.wishlist.deleteMany({ where: { customer_id: auth.id, product_code } });
    }

    if (alreadyExists) {
      return NextResponse.json({ success: false, message: "This item is already added in your cart!" }, { status: 200 });
    }

    const address = await getDefaultShippingAddress(auth.id);
    await updateCartShippingCost(cartRow!.id, address);
    const totals = await updateCartTotals(cartRow!.id, address);

    const finalCart = await prisma.cart.findUniqueOrThrow({ where: { id: cartRow!.id } });
    const finalItems = await getCartItems(cartRow!.id);

    return successResponse("Added to cart successfully!", {
      cart: {
        ...serializeBareCart(finalCart, finalItems),
        subtotal: totals!.subtotal,
        tax: totals!.tax,
        shipping_cost_total: totals!.shippingCostTotal,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { errors: [{ code: "cart_item", message: error instanceof Error ? error.message : String(error) }] },
      { status: 403 },
    );
  }
}
