import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports AddressController::set_default_shipping (AddressController.php:337-368). `findOrFail($id)`
// produces "No query results for model [App\Models\CustomerAddressBook] {id}" (id included, no
// trailing period) - confirmed against the live instance, distinct from update_address's message.
/**
 * @swagger
 * /api/v1/customer/address/set-default-shipping/{id}:
 *   post:
 *     summary: Set one of the authenticated customer's saved addresses as the default shipping address
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
 *         description: Default shipping address updated successfully. Any previous default-shipping address for this customer is cleared first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Default shipping address updated successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer, example: 12 }
 *                     default_shipping: { type: string, example: "Y" }
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
      where: { customer_id: auth.id, default_shipping: "Y" },
      data: { default_shipping: null, updated_at: nowForDb() },
    });

    const address = await prisma.customer_address_book.findFirst({
      where: { customer_id: auth.id, id: BigInt(id) },
    });
    if (!address) {
      throw new Error(`No query results for model [App\\Models\\CustomerAddressBook] ${id}`);
    }

    await prisma.customer_address_book.update({
      where: { id: address.id },
      data: { default_shipping: "Y", updated_at: nowForDb() },
    });

    return successResponse("Default shipping address updated successfully.", {
      data: { id: Number(address.id), default_shipping: "Y" },
    });
  } catch (error) {
    console.error("Error updating default shipping address", error);
    return serverErrorResponse("Failed to update default shipping address.", error);
  }
}
