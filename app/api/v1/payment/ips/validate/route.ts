import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateIpsToken } from "@/lib/connectIpsToken";
import { validateIpsTransaction } from "@/lib/connectIpsService";
import { nowForDb } from "@/lib/dbTime";

// Ports PaymentController::validateIpsTransaction (PaymentController.php:65-155). No auth
// guard in Laravel here (connectIPS calls this as a webhook/callback), so this stays public.
/**
 * @swagger
 * /api/v1/payment/ips/validate:
 *   post:
 *     summary: Validate a connectIPS transaction, upsert its local record, and sync payment_status to "paid" on success
 *     tags: [Payment]
 *     description: No auth guard - connectIPS calls this as a webhook/callback, so it must stay public.
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
 *         description: Transaction validated. `transaction` is the upserted connectips_transactions row.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 transaction:
 *                   type: object
 *                   description: Upserted connectips_transactions row.
 *                 response:
 *                   type: object
 *                   description: Raw connectIPS validateTransaction response.
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

    const response = await validateIpsTransaction(referenceId, amount, token);
    const r = response as Record<string, unknown>;

    const transaction = await prisma.connectips_transactions.upsert({
      where: { reference_id: referenceId },
      update: {
        merchant_id: BigInt(merchantId || 0),
        app_id: appId,
        txn_amt: amount,
        token,
        status: (r.status as string) || "PENDING",
        status_desc: (r.statusDesc as string) || null,
        response_payload: JSON.stringify(response),
        updated_at: nowForDb(),
      },
      create: {
        reference_id: referenceId,
        merchant_id: BigInt(merchantId || 0),
        app_id: appId,
        txn_amt: amount,
        token,
        status: (r.status as string) || "PENDING",
        status_desc: (r.statusDesc as string) || null,
        response_payload: JSON.stringify(response),
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    if (typeof r.status === "string" && r.status.toUpperCase() === "SUCCESS") {
      await prisma.orders.update({ where: { id: order.id }, data: { payment_status: "paid" } });
    }

    return NextResponse.json({ success: true, transaction, response });
  } catch (error) {
    console.error("Exception in validateIpsTransaction", error);
    return NextResponse.json(
      { success: false, error_type: "exception", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
