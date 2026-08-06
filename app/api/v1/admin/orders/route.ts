import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { fetchAdminOrders } from "@/lib/adminOrdersDb";

// Ports gargnew's app/api/v1/admin/orders/route.js.
/**
 * @swagger
 * /api/v1/admin/orders:
 *   get:
 *     summary: List orders, optionally filtered by order status (admin token)
 *     tags: [AdminOrders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         required: false
 *         description: Exact match against order_status (e.g. processing, shipped, delivered, cancelled). Omit for all orders.
 *     responses:
 *       200:
 *         description: Orders fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Order list row (orderId, customer, address, totalItems, totalAmount, orderStatus, paymentStatus, paymentMethod, created, orderDate).
 *                 count: { type: integer }
 *       401:
 *         description: Missing or invalid admin token.
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
export async function GET(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get("status") || "").trim();
    const orders = await fetchAdminOrders({ status });
    return NextResponse.json({ success: true, orders, count: orders.length });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
