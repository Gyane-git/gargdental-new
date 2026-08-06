import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse } from "@/lib/apiResponse";

// Ports CustomerController::remove_account (CustomerController.php:221-252). Note the 403
// error shape here has no `success` key at all (just `errors`), unlike most of the app.
/**
 * @swagger
 * /api/v1/customer/remove-account:
 *   delete:
 *     summary: Permanently delete the authenticated customer's account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account removed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Account removed successfully." }
 *       401:
 *         description: Missing/invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: The customer has ongoing orders (processing/shipped) and cannot be deleted. Note this error shape has no `success` key, unlike most of the API.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code: { type: string, example: "on-going" }
 *                       message: { type: string, example: "Cannot delete account: you have ongoing orders" }
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const ongoingOrders = await prisma.orders.count({
    where: { customer_id: auth.id, order_status: { in: ["processing", "shipped"] } },
  });

  if (ongoingOrders > 0) {
    return NextResponse.json(
      { errors: [{ code: "on-going", message: "Cannot delete account: you have ongoing orders" }] },
      { status: 403 },
    );
  }

  // No Passport tokens table to revoke against (see lib/auth.ts) - deleting the user row alone
  // is sufficient since our JWTs are re-validated against a live `users` row on every request.
  await prisma.users.delete({ where: { id: auth.id } });

  return successResponse("Account removed successfully.");
}
