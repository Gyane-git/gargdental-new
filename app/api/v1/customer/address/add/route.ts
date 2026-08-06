import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { serializeAddress } from "@/lib/addressSerializer";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports AddressController::add_address (AddressController.php:107-157).
/**
 * @swagger
 * /api/v1/customer/address/add:
 *   post:
 *     summary: Add a new saved address for the authenticated customer
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
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
 *               default_shipping: { type: string, enum: [Y, N], example: "Y" }
 *               default_billing: { type: string, enum: [Y, N], example: "N" }
 *     responses:
 *       201:
 *         description: Address saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Address saved successfully!" }
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
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const {
    full_name,
    phone,
    province,
    city,
    zone,
    address,
    landmark,
    address_type,
    default_shipping,
    default_billing,
  } = body as Record<string, string | number | undefined>;

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
  if (address_type !== undefined && address_type !== null && !["H", "O"].includes(String(address_type))) {
    fieldErrors.address_type = "The selected address type is invalid.";
  }
  if (default_shipping !== undefined && default_shipping !== null && !["Y", "N"].includes(String(default_shipping))) {
    fieldErrors.default_shipping = "The selected default shipping is invalid.";
  }
  if (default_billing !== undefined && default_billing !== null && !["Y", "N"].includes(String(default_billing))) {
    fieldErrors.default_billing = "The selected default billing is invalid.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    const created = await prisma.customer_address_book.create({
      data: {
        customer_id: auth.id,
        full_name: String(full_name),
        phone: String(phone),
        province_id: BigInt(province as number),
        city_id: BigInt(city as number),
        zone_id: BigInt(zone as number),
        landmark: (landmark as string) || null,
        address: String(address),
        address_type: (address_type as string) || null,
        default_shipping: (default_shipping as string) || null,
        default_billing: (default_billing as string) || null,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    return successResponse("Address saved successfully!", { data: await serializeAddress(created) }, 201);
  } catch (error) {
    console.error("Error saving customer address", error);
    return serverErrorResponse("Failed to save address", error);
  }
}
