import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { getSystemSettingValue, getCustomerAddress, createDeliveryInformation, generateIpsPaymentUrl } from "@/lib/orderHelpers";
import { generateOrderId } from "@/lib/generateOrderId";
import { isAddressInsideValley } from "@/lib/valleyCheck";
import { nowForDb } from "@/lib/dbTime";

const TAX_RATE = 0.13;

// Ports OrderController::buy_now (OrderController.php:810-1003): places an order for a single
// product, bypassing the cart entirely.
/**
 * @swagger
 * /api/v1/customer/order/buy-now:
 *   post:
 *     summary: Place an order for a single product, bypassing the cart entirely
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_method, billing_address, shipping_address, invoice_email, buy_now_item]
 *             properties:
 *               payment_method: { type: string, enum: [C, E, NP, IPS], description: "C=Cash on delivery, E/NP/IPS mark payment_status pending." }
 *               billing_address: { type: integer, description: "customer_address_book.id; must belong to the customer." }
 *               shipping_address: { type: integer, description: "customer_address_book.id; must belong to the customer." }
 *               invoice_email: { type: string, format: email }
 *               buy_now_item:
 *                 type: object
 *                 required: [product_code, quantity]
 *                 properties:
 *                   product_code: { type: string, description: "Must reference an existing product." }
 *                   quantity: { type: integer, minimum: 1 }
 *               transaction_id: { type: string, description: "Optional; defaults to empty string." }
 *     responses:
 *       201:
 *         description: Order placed successfully, or (payment_method IPS) an IPS payment redirect.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean, example: true }
 *                     message: { type: string, example: "Order placed successfully" }
 *                     order_id: { type: string }
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean, example: true }
 *                     message: { type: string, example: "Redirect to IPS for payment" }
 *                     order_id: { type: string }
 *                     payment_url: { type: string }
 *                     payment_status: { type: string, example: "pending" }
 *                     transaction_id: { type: string }
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
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { payment_method, billing_address, shipping_address, invoice_email, buy_now_item, transaction_id } = body as {
    payment_method?: string;
    billing_address?: number;
    shipping_address?: number;
    invoice_email?: string;
    buy_now_item?: { product_code?: string; quantity?: number };
    transaction_id?: string;
  };

  const fieldErrors: Record<string, string> = {};
  if (!payment_method || !["C", "E", "NP", "IPS"].includes(payment_method)) {
    fieldErrors.payment_method = "The selected payment method is invalid.";
  }
  if (billing_address === undefined || billing_address === null) fieldErrors.billing_address = "The billing address field is required.";
  else if (!(await prisma.customer_address_book.findUnique({ where: { id: BigInt(billing_address) } }))) {
    fieldErrors.billing_address = "The selected billing address is invalid.";
  }
  if (shipping_address === undefined || shipping_address === null) fieldErrors.shipping_address = "The shipping address field is required.";
  else if (!(await prisma.customer_address_book.findUnique({ where: { id: BigInt(shipping_address) } }))) {
    fieldErrors.shipping_address = "The selected shipping address is invalid.";
  }
  if (!invoice_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice_email)) fieldErrors.invoice_email = "The invoice email field is required.";
  if (!buy_now_item?.product_code || !(await prisma.products.findFirst({ where: { product_code: buy_now_item.product_code } }))) {
    fieldErrors["buy_now_item.product_code"] = "The selected buy now item.product code is invalid.";
  }
  if (!buy_now_item?.quantity || buy_now_item.quantity < 1) fieldErrors["buy_now_item.quantity"] = "The buy now item.quantity field must be at least 1.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    const freeShippingOption = await getSystemSettingValue("free_shipping_option");
    const freeShippingInValleyThreshold = await getSystemSettingValue("free_shipping_threshold_inside_of_valley");
    const freeShippingOutValleyThreshold = await getSystemSettingValue("free_shipping_threshold_out_of_valley");

    const billingAddress = await getCustomerAddress(auth.id, billing_address as number);
    const shippingAddress = await getCustomerAddress(auth.id, shipping_address as number);

    const billingInfo = await createDeliveryInformation(auth.id, billingAddress, invoice_email as string, "billing");
    const shippingInfo = await createDeliveryInformation(auth.id, shippingAddress, invoice_email as string, "shipping");

    const orderId = await generateOrderId();
    const transactionId = transaction_id || "";

    const valleyCheck = await isAddressInsideValley(auth.id, shipping_address as number);
    const shippingSnapshot = valleyCheck ? freeShippingInValleyThreshold : freeShippingOutValleyThreshold;

    const product = await prisma.products.findFirst({ where: { product_code: buy_now_item!.product_code } });
    if (!product) throw new Error("Product not found");

    const quantity = buy_now_item!.quantity as number;
    const subtotal = quantity * Number(product.actual_price || 0);
    const subtotalWithoutTax = subtotal - TAX_RATE * subtotal;
    const taxAmount = TAX_RATE * subtotal;
    const discount = quantity * Number(product.discount || 0);

    let shipping = 0;
    const shippingCity = await prisma.set_shipping.findUnique({ where: { id: shippingAddress.city_id } });
    if (shippingCity && shippingCity.apply_shipping !== 0) {
      if (freeShippingOption === "free_threshold") {
        shipping = subtotal < parseFloat(shippingSnapshot || "0") ? Number(shippingCity.shipping_cost) : 0;
      } else {
        shipping = Number(shippingCity.shipping_cost);
      }
    }

    const grandTotal = subtotal + shipping - discount;
    const paymentStatus = ["E", "NP", "IPS"].includes(payment_method as string) ? "pending" : "unpaid";

    const order = await prisma.orders.create({
      data: {
        order_id: BigInt(orderId),
        customer_id: auth.id,
        transaction_id: transactionId,
        shipping_delivery_information_id: shippingInfo.id,
        billing_delivery_information_id: billingInfo.id,
        payment_method: payment_method as string,
        subtotal_without_tax: subtotalWithoutTax,
        subtotal,
        tax: taxAmount,
        shipping_cost: shipping,
        shipping_snapshot: JSON.stringify(shippingSnapshot),
        discount,
        total_amount: grandTotal,
        order_status: "processing",
        payment_status: paymentStatus,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    await prisma.delivery_information.update({ where: { id: billingInfo.id }, data: { order_id: order.order_id.toString() } });
    await prisma.delivery_information.update({ where: { id: shippingInfo.id }, data: { order_id: order.order_id.toString() } });

    await prisma.order_items.create({
      data: {
        order_id: order.order_id,
        product_code: product.product_code,
        quantity,
        price: product.sell_price ?? 0,
        actual_price: product.actual_price ?? 0,
        subtotal_without_tax: subtotalWithoutTax,
        tax: taxAmount,
        subtotal,
        discount,
        shipping_cost: shipping,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    await prisma.products.update({
      where: { id: product.id },
      data: {
        available_quantity: Math.max(0, Number(product.available_quantity) - quantity),
        stock_quantity: Math.max(0, Number(product.stock_quantity) - quantity),
      },
    });

    if (payment_method === "IPS") {
      const ipsUrl = generateIpsPaymentUrl(order, grandTotal, auth);
      return successResponse(
        "Redirect to IPS for payment",
        {
          order_id: order.order_id.toString(),
          payment_url: ipsUrl,
          payment_status: "pending",
          transaction_id: transactionId,
        },
        201,
      );
    }

    return successResponse("Order placed successfully", { order_id: order.order_id.toString() }, 201);
  } catch (error) {
    console.error("Buy now failed", error);
    return serverErrorResponse("Failed to place order", error);
  }
}
