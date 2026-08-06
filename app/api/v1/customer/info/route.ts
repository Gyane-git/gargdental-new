import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { serializeAddress } from "@/lib/addressSerializer";
import { toCustomerResource } from "@/lib/customerResource";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports CustomerController::get_info (CustomerController.php:37-58). CustomerResource wraps its
// fields under a `data` key (Laravel's default JsonResource wrapping - withoutWrapping() is
// never called in this app), with success/message/shipping_cost/addresses merged in alongside
// via ->additional(). Note: shipping_cost is the raw PHP float `0.00` (-> JSON number 0) when the
// customer has no default-shipping address, but a Decimal-cast STRING like "150.00" when they do
// - a real type inconsistency in Laravel itself, replicated as-is.
/**
 * @swagger
 * /api/v1/customer/info:
 *   get:
 *     summary: Get the authenticated customer's profile, default shipping cost, and saved addresses
 *     tags: [Customer]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Customer details retrieved successfully" }
 *                 data:
 *                   type: object
 *                   description: Customer resource (lib/customerResource.ts) - id, full_name, phone, email, login_medium, image_full_url, created_at.
 *                 shipping_cost:
 *                   description: Shipping cost of the customer's default-shipping address. A number (0) when there is none, a decimal string (e.g. "150.00") when there is - a real Laravel type inconsistency, replicated as-is.
 *                   oneOf:
 *                     - type: number
 *                     - type: string
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
    const addressRows = await prisma.customer_address_book.findMany({ where: { customer_id: auth.id } });
    const addresses = await Promise.all(addressRows.map(serializeAddress));

    const shippingAddress = addresses.find((a) => a.default_shipping === "Y");
    const shippingCost = shippingAddress?.city?.shipping_cost ?? 0;

    return successResponse("Customer details retrieved successfully", {
      data: toCustomerResource(auth),
      shipping_cost: shippingCost,
      addresses,
    });
  } catch (error) {
    console.error("Exception occurred while fetching customer details", error);
    return serverErrorResponse("Failed to get customer details", error);
  }
}
