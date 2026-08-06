import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports AddressController::remove_address (AddressController.php:443-464).
/**
 * @swagger
 * /api/v1/customer/address/remove/{id}:
 *   delete:
 *     summary: Remove one of the authenticated customer's saved addresses
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
 *         description: Address removed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Address removed successfully." }
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
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    const address = await prisma.customer_address_book.findFirst({
      where: { customer_id: auth.id, id: BigInt(id) },
    });
    if (!address) {
      throw new Error(`No query results for model [App\\Models\\CustomerAddressBook] ${id}`);
    }

    await prisma.customer_address_book.delete({ where: { id: address.id } });

    return successResponse("Address removed successfully.");
  } catch (error) {
    console.error("Error removing address", error);
    return serverErrorResponse("Failed to remove address.", error);
  }
}
