import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { fetchAdminOrderById, updateOrderStatus } from "@/lib/adminOrdersDb";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/v1/admin/orders/[id]/route.js. The order-status-change email
// notification is intentionally skipped (fire-and-forget, doesn't affect this response) - same
// simplification used throughout this project's order endpoints.
/**
 * @swagger
 * /api/v1/admin/orders/{id}:
 *   get:
 *     summary: Get full order detail by order_id or numeric id (admin token)
 *     tags: [AdminOrders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order's order_id (with or without leading #) or its numeric id.
 *     responses:
 *       200:
 *         description: Order fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 order:
 *                   type: object
 *                   description: Full order detail (orderId, customer, address, totalItems, totalAmount, orderStatus, paymentStatus, paymentMethod, shippingCarrier, customerInfo, shippingInfo, summary, items[], raw, etc).
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Order not found.
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
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const order = await fetchAdminOrderById(id);
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, order });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase();

/**
 * @swagger
 * /api/v1/admin/orders/{id}:
 *   patch:
 *     summary: Update an order's status, payment status/method, and related tracking info (admin token)
 *     description: >
 *       Depending on the resulting order_status, also writes a matching status-history row:
 *       order_shipped (shipped), order_delivered (delivered), or order_cancel (cancelled, requires
 *       cancel_reason or cancel_reason_id). If the resulting payment is "paid" (or paid_amount/
 *       payment method is sent), also writes an order_payments row. Records an audit log entry.
 *     tags: [AdminOrders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order's order_id (with or without leading #) or its numeric id.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               order_status: { type: string, example: "shipped", description: "Alias: orderStatus. Defaults to the order's current status." }
 *               payment_status: { type: string, example: "paid", description: "Alias: paymentStatus. Defaults to the order's current status." }
 *               payment_mode: { type: string, description: "Alias: paymentMethod." }
 *               cancel_reason_id: { type: string, description: "Alias: cancelReasonId. Required (with cancel_reason) when order_status is cancelled." }
 *               cancel_reason: { type: string, description: "Alias: cancelReason." }
 *               tracking_number: { type: string, description: "Used when order_status is shipped. Alias: trackingNumber." }
 *               shipping_carrier: { type: string, description: "shipping_carriers id, used when order_status is shipped." }
 *               estimated_delivery_date: { type: string, format: date, description: Used when order_status is shipped. }
 *               delivery_date: { type: string, format: date, description: Used when order_status is delivered. Defaults to now. }
 *               received_by: { type: string, description: "Used when order_status is delivered. Alias: receivedBy." }
 *               transaction_id: { type: string }
 *               reference_id: { type: string, description: "Alias: referenceId." }
 *               paid_amount: { type: number, description: Defaults to the order's total_amount. }
 *     responses:
 *       200:
 *         description: Order updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Order updated successfully." }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Order not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Order not found." }
 *       422:
 *         description: Cancellation reason required when cancelling.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Please select a cancellation reason." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const orderView = await fetchAdminOrderById(id);
    if (!orderView) {
      return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    }
    const order = orderView.raw;

    const body = await request.json();
    const nextOrderStatus = normalizeStatus(body.order_status || body.orderStatus || order.order_status);
    const nextPaymentStatus = normalizeStatus(body.payment_status || body.paymentStatus || order.payment_status);
    const nextPaymentMethod = String(body.payment_mode || body.paymentMethod || order.payment_method || "").trim() || null;
    const cancelReasonId = body.cancel_reason_id || body.cancelReasonId || null;
    const cancelReasonText = String(body.cancel_reason || body.cancelReason || "").trim();

    if (nextOrderStatus === "cancelled" && !cancelReasonText && !cancelReasonId) {
      return NextResponse.json({ success: false, message: "Please select a cancellation reason." }, { status: 422 });
    }

    await updateOrderStatus(order, { orderStatus: nextOrderStatus, paymentStatus: nextPaymentStatus, paymentMethod: nextPaymentMethod });

    // Write into the matching status-history table, mirroring gargnew's upsertOrderStatusHistory.
    if (nextOrderStatus === "shipped") {
      await prisma.order_shipped.create({
        data: {
          order_id: order.order_id,
          tracking_number: body.tracking_number || body.trackingNumber || null,
          shipping_carrier: body.shipping_carrier ? Number(body.shipping_carrier) : null,
          estimated_delivery_date: body.estimated_delivery_date ? new Date(body.estimated_delivery_date) : null,
          created_at: nowForDb(),
          updated_at: nowForDb(),
        },
      });
    } else if (nextOrderStatus === "delivered") {
      await prisma.order_delivered.create({
        data: {
          order_id: order.order_id,
          delivery_date: body.delivery_date ? new Date(body.delivery_date) : nowForDb(),
          received_by: body.received_by || body.receivedBy || null,
          created_at: nowForDb(),
          updated_at: nowForDb(),
        },
      });
    } else if (nextOrderStatus === "cancelled") {
      await prisma.order_cancel.create({
        data: {
          order_id: order.order_id,
          cancel_reason: cancelReasonId ? BigInt(cancelReasonId) : 0,
          reason_description: cancelReasonText || "Cancelled by admin",
          policy_checked: "Y",
          cancelled_by: "admin",
          created_at: nowForDb(),
          updated_at: nowForDb(),
        },
      });
    }

    if (nextPaymentStatus === "paid" || body.paid_amount || nextPaymentMethod) {
      await prisma.order_payments.create({
        data: {
          order_id: order.order_id,
          payment_mode: nextPaymentMethod,
          transactionId: body.transaction_id || order.transaction_id || null,
          referenceId: body.reference_id || body.referenceId || null,
          paid_amount: body.paid_amount || order.total_amount,
          status: nextPaymentStatus,
          created_at: nowForDb(),
          updated_at: nowForDb(),
        },
      });
    }

    await recordAuditLog({
      adminId: authUser.id,
      action: "Update",
      module: "orders",
      modelType: "Order",
      modelId: order.order_id.toString(),
      newData: { order_status: nextOrderStatus, payment_status: nextPaymentStatus, payment_method: nextPaymentMethod },
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "Order updated successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
