import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";
import { sendOrderCancellationEmail } from "@/lib/mailer";

// Ports OrderController::add_to_cancel (OrderController.php:1235-1353). The cancellation email
// is fire-and-forget - the cancellation itself has already committed by the time it's sent, so a
// slow/failed SMTP send must not turn a successful cancellation into an error response.
/**
 * @swagger
 * /api/v1/customer/order/cancel:
 *   post:
 *     summary: Cancel a customer's own order (only allowed while it is still "processing")
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_id, reason_id, reason_description, policy_checked]
 *             properties:
 *               order_id: { type: integer, description: "orders.order_id; must exist." }
 *               reason_id: { type: integer, description: "order_cancel_reasons.id; must exist." }
 *               reason_description: { type: string }
 *               policy_checked: { type: string, enum: [Y, N] }
 *     responses:
 *       201:
 *         description: Order cancelled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Order cancelled successfully" }
 *                 order_id: { type: string }
 *       401:
 *         description: Missing or invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: Field validation errors (standard envelope), OR the order exists but is not in a cancellable ("processing") status (inline `{success:false, message}`, no errors array).
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/ValidationErrorResponse'
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean, example: false }
 *                     message: { type: string, example: "Order cannot be cancelled in its current status." }
 *       404:
 *         description: No order with that order_id belongs to this customer.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Order not found." }
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
  const { order_id, reason_id, reason_description, policy_checked } = body as {
    order_id?: number;
    reason_id?: number;
    reason_description?: string;
    policy_checked?: string;
  };

  const fieldErrors: Record<string, string> = {};
  if (order_id === undefined || order_id === null) fieldErrors.order_id = "The order id field is required.";
  else if (!(await prisma.orders.findFirst({ where: { order_id: BigInt(order_id) } }))) {
    fieldErrors.order_id = "The selected order id is invalid.";
  }
  if (reason_id === undefined || reason_id === null) fieldErrors.reason_id = "The reason id field is required.";
  else if (!(await prisma.order_cancel_reasons.findUnique({ where: { id: BigInt(reason_id) } }))) {
    fieldErrors.reason_id = "The selected reason id is invalid.";
  }
  if (!reason_description) fieldErrors.reason_description = "The reason description field is required.";
  if (!policy_checked || !["Y", "N"].includes(policy_checked)) fieldErrors.policy_checked = "The selected policy checked is invalid.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    const order = await prisma.orders.findFirst({ where: { order_id: BigInt(order_id as number), customer_id: auth.id } });
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    }
    if (order.order_status !== "processing") {
      return NextResponse.json({ success: false, message: "Order cannot be cancelled in its current status." }, { status: 403 });
    }

    await prisma.orders.update({ where: { id: order.id }, data: { order_status: "cancelled", updated_at: nowForDb() } });

    const orderItems = await prisma.order_items.findMany({ where: { order_id: order.order_id } });
    for (const item of orderItems) {
      const product = await prisma.products.findFirst({ where: { product_code: item.product_code } });
      if (product) {
        await prisma.products.update({
          where: { id: product.id },
          data: {
            available_quantity: Number(product.available_quantity) + Number(item.quantity),
            stock_quantity: Number(product.stock_quantity) + Number(item.quantity),
          },
        });
      }
    }

    await prisma.order_cancel.create({
      data: {
        order_id: order.order_id,
        cancel_reason: BigInt(reason_id as number),
        reason_description: reason_description as string,
        policy_checked: policy_checked as string,
        cancelled_by: "customer",
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    sendOrderCancellationEmail(auth.email, order.order_id.toString(), reason_description as string).catch((error) =>
      console.error("Failed to send order cancellation email", error),
    );

    return successResponse("Order cancelled successfully", { order_id: order.order_id.toString() }, 201);
  } catch (error) {
    console.error("Order cancellation failed", error);
    return serverErrorResponse("Failed to cancel order", error);
  }
}
