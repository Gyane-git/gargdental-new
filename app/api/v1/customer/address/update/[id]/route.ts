import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { serializeAddress } from "@/lib/addressSerializer";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports AddressController::update_address (AddressController.php:266-313). Note: default_shipping/
// default_billing are untouched here (not part of this endpoint's validated/assigned fields).
// `firstOrFail()` with no id context produces the exact "No query results for model
// [App\Models\CustomerAddressBook]." message (trailing period, no id) - confirmed against the
// live Laravel instance, which is a real, if odd, 500 (ModelNotFoundException extends
// \Exception so IS caught by the generic try/catch) rather than a 404.
/**
 * @swagger
 * /api/v1/customer/address/update/{id}:
 *   post:
 *     summary: Update one of the authenticated customer's saved addresses
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, phone, province, city, zone, address]
 *             properties:
 *               full_name: { type: string, example: "Ram Sharma" }
 *               phone: { type: string, example: "9800000000" }
 *               province: { type: integer, description: "provinces.id", example: 1 }
 *               city: { type: integer, description: "set_shipping.id", example: 3 }
 *               zone: { type: integer, description: "address_zone.id", example: 7 }
 *               address: { type: string, example: "Putalisadak, Kathmandu" }
 *               landmark: { type: string, example: "Near City Center" }
 *               address_type: { type: string, enum: [H, O], description: "H = Home, O = Office", example: "H" }
 *     responses:
 *       200:
 *         description: Address updated successfully. Note default_shipping/default_billing are not touched by this endpoint.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Address updated successfully" }
 *                 data:
 *                   type: object
 *                   description: Serialized address (lib/addressSerializer.ts) with nested province/city/zone objects.
 *       401:
 *         description: Missing or invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: Validation errors (missing/invalid fields, or an unknown province/city/zone id).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       500:
 *         description: "id doesn't exist or doesn't belong to this customer, or an unexpected server error. Both cases hit the same catch block, matching Laravel's firstOrFail() exception being a plain caught Exception rather than a 404."
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { full_name, phone, province, city, zone, address, landmark, address_type } = body as Record<
    string,
    string | number | undefined
  >;

  const fieldErrors: Record<string, string> = {};
  if (!full_name) fieldErrors.full_name = "The full name field is required.";
  else if (String(full_name).length > 255) fieldErrors.full_name = "The full name field must not be greater than 255 characters.";
  if (!phone) fieldErrors.phone = "The phone field is required.";
  else if (String(phone).length > 20) fieldErrors.phone = "The phone field must not be greater than 20 characters.";
  if (province === undefined || province === null) fieldErrors.province = "The province field is required.";
  else if (!(await prisma.provinces.findUnique({ where: { id: BigInt(province) } }))) fieldErrors.province = "The selected province is invalid.";
  if (city === undefined || city === null) fieldErrors.city = "The city field is required.";
  else if (!(await prisma.set_shipping.findUnique({ where: { id: BigInt(city) } }))) fieldErrors.city = "The selected city is invalid.";
  if (zone === undefined || zone === null) fieldErrors.zone = "The zone field is required.";
  else if (!(await prisma.address_zone.findUnique({ where: { id: BigInt(zone) } }))) fieldErrors.zone = "The selected zone is invalid.";
  if (!address) fieldErrors.address = "The address field is required.";
  else if (String(address).length > 255) fieldErrors.address = "The address field must not be greater than 255 characters.";
  if (address_type !== undefined && address_type !== null && !["H", "O"].includes(String(address_type))) {
    fieldErrors.address_type = "The selected address type is invalid.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    const existing = await prisma.customer_address_book.findFirst({
      where: { customer_id: auth.id, id: BigInt(id) },
    });
    if (!existing) {
      throw new Error("No query results for model [App\\Models\\CustomerAddressBook].");
    }

    const updated = await prisma.customer_address_book.update({
      where: { id: existing.id },
      data: {
        full_name: String(full_name),
        phone: String(phone),
        province_id: BigInt(province as number),
        city_id: BigInt(city as number),
        zone_id: BigInt(zone as number),
        address: String(address),
        landmark: (landmark as string) || null,
        address_type: (address_type as string) || null,
        updated_at: nowForDb(),
      },
    });

    return successResponse("Address updated successfully", { data: await serializeAddress(updated) });
  } catch (error) {
    console.error("Error updating customer address", error);
    return serverErrorResponse("Failed to update address", error);
  }
}
