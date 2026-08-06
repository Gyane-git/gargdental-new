import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports OrderController::get_order_cancel_reasons (OrderController.php:1075-1093).
/**
 * @swagger
 * /api/v1/customer/order/reasons-list:
 *   get:
 *     summary: List active order cancellation reasons available to customers
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cancel reasons fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Cancel Reasons fetched successfully." }
 *                 reasons:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: order_cancel_reasons row (status=1, reason_type=cancel, reason_for=customer).
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
    const reasons = await prisma.order_cancel_reasons.findMany({
      where: { status: 1, reason_type: "cancel", reason_for: "customer" },
    });
    return successResponse("Cancel Reasons fetched successfully.", { reasons });
  } catch (error) {
    console.error("Exception occurred while fetching cancel reasons", error);
    return serverErrorResponse("Failed to get cancel reasons", error);
  }
}
