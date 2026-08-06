import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { serializeAddress } from "@/lib/addressSerializer";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports AddressController::get_addresses (AddressController.php:36-64). Note: 201, not 200
// (a Laravel quirk on what's really a GET/read endpoint), and the `addresses` empty-array branch
// is actually unreachable in Laravel (an Eloquent collection is always truthy, even when empty)
// so we always take the success path, same as Laravel does in practice.
/**
 * @swagger
 * /api/v1/customer/address/list:
 *   get:
 *     summary: List all saved addresses for the authenticated customer
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Addresses fetched successfully. Uses HTTP 201 (not 200) on this read endpoint, matching a Laravel quirk in the ported controller.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Addresses fetched successfully!" }
 *                 addresses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Serialized address (lib/addressSerializer.ts) with nested province/city/zone objects.
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
    const rows = await prisma.customer_address_book.findMany({ where: { customer_id: auth.id } });
    const addresses = await Promise.all(rows.map(serializeAddress));
    return successResponse("Addresses fetched successfully!", { addresses }, 201);
  } catch (error) {
    console.error("Error fetching addresses", error);
    return serverErrorResponse("Failed to fetch addresses", error);
  }
}
