import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { getSystemSettingValue, getCustomerAddress, createDeliveryInformation, generateIpsPaymentUrl } from "@/lib/orderHelpers";
import { generateOrderId } from "@/lib/generateOrderId";
import { isAddressInsideValley } from "@/lib/valleyCheck";
import { nowForDb } from "@/lib/dbTime";
import { sendOrderConfirmationEmail } from "@/lib/mailer";

const TAX_RATE = 0.13;

// Ports OrderController::add_to_order (OrderController.php:306-481). Places an order from
// selected cart items. The confirmation email is sent fire-and-forget - a failed/slow SMTP send
// must never fail order placement itself, since the order and stock/cart mutations above have
// already committed by this point.
/**
 * @swagger
 * /api/v1/customer/order/add:
 *   post:
 *     summary: Place an order from selected items in the authenticated customer's cart
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_method, billing_address, shipping_address, invoice_email, selected_items]
 *             properties:
 *               payment_method: { type: string, enum: [C, E, NP, IPS], description: "C=Cash on delivery, E/NP/IPS mark payment_status pending." }
 *               billing_address: { type: integer, description: "customer_address_book.id; must belong to the customer." }
 *               shipping_address: { type: integer, description: "customer_address_book.id; must belong to the customer." }
 *               invoice_email: { type: string, format: email }
 *               selected_items: { type: array, items: { type: integer }, description: "cart_items.id values to convert into the order." }
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
 *       400:
 *         description: None of the selected_items were found in the customer's cart.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "No selected cart items found." }
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
 *       404:
 *         description: The customer has no cart at all.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Cart not found" }
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
  const { payment_method, billing_address, shipping_address, invoice_email, selected_items, transaction_id } = body as {
    payment_method?: string;
    billing_address?: number;
    shipping_address?: number;
    invoice_email?: string;
    selected_items?: number[];
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
  if (!Array.isArray(selected_items) || selected_items.length === 0) fieldErrors.selected_items = "The selected items field is required.";
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

    const newOrderId = await generateOrderId();
    const transactionId = transaction_id || "";

    const valleyCheck = await isAddressInsideValley(auth.id, shipping_address as number);
    const shippingSnapshot = valleyCheck ? freeShippingInValleyThreshold : freeShippingOutValleyThreshold;

    const cart = await prisma.cart.findFirst({ where: { customer_id: auth.id } });
    if (!cart) {
      return NextResponse.json({ success: false, message: "Cart not found" }, { status: 404 });
    }

    const selectedItems = await prisma.cart_items.findMany({
      where: { cart_id: cart.id, id: { in: (selected_items as number[]).map((i) => BigInt(i)) } },
    });
    if (selectedItems.length === 0) {
      return NextResponse.json({ success: false, message: "No selected cart items found." }, { status: 400 });
    }

    const selectedWithProduct = await Promise.all(
      selectedItems.map(async (item) => ({
        item,
        product: await prisma.products.findFirst({ where: { product_code: item.product_code } }),
      })),
    );

    const subtotal = selectedWithProduct.reduce(
      (sum, { item, product }) => sum + Number(item.quantity) * Number(product?.actual_price || 0),
      0,
    );
    const subtotalWithoutTax = subtotal - TAX_RATE * subtotal;
    const totalTax = subtotal - subtotalWithoutTax;
    const totalDiscount = selectedWithProduct.reduce(
      (sum, { item, product }) => sum + Number(item.quantity) * Number(product?.discount || 0),
      0,
    );

    let shipping = 0;
    const shippingCity = await prisma.set_shipping.findUnique({ where: { id: shippingAddress.city_id } });
    if (shippingCity && shippingCity.apply_shipping !== 0) {
      if (freeShippingOption === "free_threshold") {
        shipping = subtotal < parseFloat(shippingSnapshot || "0") ? Number(shippingCity.shipping_cost) : 0;
      } else {
        shipping = Number(shippingCity.shipping_cost);
      }
    }

    const grandTotal = subtotal + shipping - totalDiscount;
    const paymentStatus = ["E", "NP", "IPS"].includes(payment_method as string) ? "pending" : "unpaid";

    const order = await prisma.orders.create({
      data: {
        order_id: BigInt(newOrderId),
        customer_id: auth.id,
        transaction_id: transactionId,
        shipping_delivery_information_id: shippingInfo.id,
        billing_delivery_information_id: billingInfo.id,
        payment_method: payment_method as string,
        subtotal_without_tax: subtotalWithoutTax,
        tax: totalTax,
        subtotal,
        shipping_cost: shipping,
        shipping_snapshot: JSON.stringify(shippingSnapshot),
        discount: totalDiscount,
        total_amount: grandTotal,
        order_status: "processing",
        payment_status: paymentStatus,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    await prisma.delivery_information.update({ where: { id: billingInfo.id }, data: { order_id: order.order_id.toString() } });
    await prisma.delivery_information.update({ where: { id: shippingInfo.id }, data: { order_id: order.order_id.toString() } });

    for (const { item, product } of selectedWithProduct) {
      const priceWithTax = Number(product?.actual_price || 0);
      const quantity = Number(item.quantity);
      const priceWithoutTax = priceWithTax - TAX_RATE * priceWithTax;
      const taxPerQty = priceWithTax - priceWithoutTax;
      const itemSubtotalWithoutTax = priceWithoutTax * quantity;
      const itemTotalTax = taxPerQty * quantity;
      const itemSubtotalWithTax = itemSubtotalWithoutTax + itemTotalTax;
      const discountAmount = Number(product?.discount || 0) * quantity;

      await prisma.order_items.create({
        data: {
          order_id: order.order_id,
          product_code: item.product_code,
          quantity: item.quantity,
          price: product?.sell_price ?? 0,
          actual_price: priceWithTax,
          subtotal_without_tax: itemSubtotalWithoutTax,
          tax: itemTotalTax,
          subtotal: itemSubtotalWithTax,
          discount: discountAmount,
          created_at: nowForDb(),
          updated_at: nowForDb(),
        },
      });

      if (product) {
        await prisma.products.update({
          where: { id: product.id },
          data: {
            available_quantity: Math.max(0, Number(product.available_quantity) - quantity),
            stock_quantity: Math.max(0, Number(product.stock_quantity) - quantity),
          },
        });
      }
    }

    await prisma.cart_items.deleteMany({ where: { id: { in: selectedItems.map((i) => i.id) } } });
    await prisma.cart.update({
      where: { id: cart.id },
      data: { subtotal: Math.max(0, Number(cart.subtotal) - subtotal) },
    });

    sendOrderConfirmationEmail(
      invoice_email as string,
      order.order_id.toString(),
      selectedWithProduct.map(({ item, product }) => ({
        name: product?.product_name || item.product_code,
        quantity: Number(item.quantity),
        price: Number(product?.sell_price ?? 0),
      })),
      grandTotal,
    ).catch((error) => console.error("Failed to send order confirmation email", error));

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
    console.error("Failed to place order", error);
    return serverErrorResponse("Failed to place order. Please try again.", error);
  }
}
