import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateIpsToken } from "@/lib/connectIpsToken";
import { ipsDetails } from "@/lib/connectIpsService";

// Ports PaymentController::transactionDetails (PaymentController.php:203-279).
/**
 * @swagger
 * /api/v1/payment/ips/transaction-details:
 *   post:
 *     summary: Fetch connectIPS transaction details for an order and sync payment_status to "paid" on success
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [referenceId]
 *             properties:
 *               referenceId: { type: string, description: "orders.transaction_id to look up." }
 *     responses:
 *       200:
 *         description: Transaction details fetched. `order.payment_status` reflects the connectIPS status update if the gateway reported SUCCESS.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 order:
 *                   type: object
 *                   description: orders row (post-update if payment just succeeded).
 *                 response:
 *                   type: object
 *                   description: Raw connectIPS transactionDetails response.
 *       404:
 *         description: No order with that transaction_id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Transaction not found" }
 *       422:
 *         description: referenceId missing. DEVIATION - real Laravel validation-exception shape, not the standard ValidationErrorResponse envelope.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 error_type: { type: string, example: "validation" }
 *                 errors:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items: { type: string }
 *                   example: { referenceId: ["The reference id field is required."] }
 *       500:
 *         description: Unexpected server error. DEVIATION - not the standard ServerErrorResponse envelope (adds error_type, no separate `error` field).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 error_type: { type: string, example: "exception" }
 *                 message: { type: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const referenceId = String((body as { referenceId?: string }).referenceId || "").trim();

  if (!referenceId) {
    return NextResponse.json(
      { success: false, error_type: "validation", errors: { referenceId: ["The reference id field is required."] } },
      { status: 422 },
    );
  }

  try {
    const order = await prisma.orders.findFirst({ where: { transaction_id: referenceId } });
    if (!order) {
      return NextResponse.json({ success: false, message: "Transaction not found" }, { status: 404 });
    }

    const amount = Number(order.total_amount) * 100;
    const merchantId = process.env.CONNECT_IPS_MERCHANT_ID || process.env.NEXT_PUBLIC_CONNECTIPS_MERCHANTID || "";
    const appId = process.env.CONNECT_IPS_APP_ID || process.env.NEXT_PUBLIC_CONNECTIPS_APPID || "";
    const token = generateIpsToken(merchantId, appId, referenceId, amount);

    const response = await ipsDetails(referenceId, amount, token);
    const r = response as Record<string, unknown>;

    if (typeof r.status === "string" && r.status.toUpperCase() === "SUCCESS" && order.payment_status !== "paid") {
      await prisma.orders.update({ where: { id: order.id }, data: { payment_status: "paid" } });
    }

    return NextResponse.json({ success: true, order, response });
  } catch (error) {
    console.error("Exception in transactionDetails", error);
    return NextResponse.json(
      { success: false, error_type: "exception", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
