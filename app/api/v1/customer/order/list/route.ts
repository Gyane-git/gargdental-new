import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { serializeOrder } from "@/lib/orderSerializer";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

const VALID_STATUSES = ["processing", "shipped", "delivered", "cancelled", "returned"];

// Ports OrderController::get_orders (OrderController.php:59-113).
/**
 * @swagger
 * /api/v1/customer/order/list:
 *   get:
 *     summary: List the authenticated customer's orders, filtered by status
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [processing, shipped, delivered, cancelled, returned]
 *           default: processing
 *         required: false
 *         description: Defaults to "processing" when omitted.
 *     responses:
 *       200:
 *         description: Orders fetched successfully. Cancel details are included on each order only when status=cancelled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Processing orders fetched successfully!" }
 *                 orders:
 *                   type: object
 *                   properties:
 *                     count: { type: integer }
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: Serialized order (lib/orderSerializer.ts).
 *       400:
 *         description: status query param is not one of the recognized values.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid order status requested." }
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

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "processing";

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ success: false, message: "Invalid order status requested." }, { status: 400 });
  }

  try {
    const rows = await prisma.orders.findMany({
      where: { customer_id: auth.id, order_status: status },
      orderBy: { id: "desc" },
    });

    const orders = await Promise.all(rows.map((row) => serializeOrder(row, { withCancelDetails: status === "cancelled" })));

    return successResponse(`${status.charAt(0).toUpperCase()}${status.slice(1)} orders fetched successfully!`, {
      orders: { count: orders.length, orders },
    });
  } catch (error) {
    console.error("Exception occurred while fetching orders", error);
    return serverErrorResponse("Failed to fetch orders", error);
  }
}
