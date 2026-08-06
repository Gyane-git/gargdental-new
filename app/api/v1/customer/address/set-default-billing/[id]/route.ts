import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports AddressController::set_default_billing (AddressController.php:392-423).
/**
 * @swagger
 * /api/v1/customer/address/set-default-billing/{id}:
 *   post:
 *     summary: Set one of the authenticated customer's saved addresses as the default billing address
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: customer_address_book.id. Must belong to the authenticated customer.
 *     responses:
 *       200:
 *         description: Default billing address updated successfully. Any previous default-billing address for this customer is cleared first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Default billing address updated successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer, example: 12 }
 *                     default_billing: { type: string, example: "Y" }
 *       401:
 *         description: Missing or invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: "id doesn't exist or doesn't belong to this customer, or an unexpected server error. Both cases hit the same catch block, matching Laravel's findOrFail() exception being a plain caught Exception rather than a 404."
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    await prisma.customer_address_book.updateMany({
      where: { customer_id: auth.id, default_billing: "Y" },
      data: { default_billing: null, updated_at: nowForDb() },
    });

    const address = await prisma.customer_address_book.findFirst({
      where: { customer_id: auth.id, id: BigInt(id) },
    });
    if (!address) {
      throw new Error(`No query results for model [App\\Models\\CustomerAddressBook] ${id}`);
    }

    await prisma.customer_address_book.update({
      where: { id: address.id },
      data: { default_billing: "Y", updated_at: nowForDb() },
    });

    return successResponse("Default billing address updated successfully.", {
      data: { id: Number(address.id), default_billing: "Y" },
    });
  } catch (error) {
    console.error("Error updating default billing address", error);
    return serverErrorResponse("Failed to update default billing address.", error);
  }
}
