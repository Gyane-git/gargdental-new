import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports AddressController::load_address_dropdowns (AddressController.php:181-222): a nested
// province -> city (set_shipping, ->with('province')) -> zones (address_zone, ->with('city.province'))
// tree. Field names (`cities`, `zones`, `province`, `city`) match Laravel's relation/dynamic-property
// names exactly.
/**
 * @swagger
 * /api/v1/customer/address/load-address-dropdowns:
 *   get:
 *     summary: Load the full province -> city -> zone hierarchy for populating address form dropdowns
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Address dropdown data loaded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Address dropdown data loaded successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: "{ id, name, cities: [{ ...set_shipping row, province, zones: [{ ...address_zone row, city: { ...set_shipping row, province } }] }] }"
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
    const provinces = await prisma.provinces.findMany({ select: { id: true, province_name: true } });

    const data = await Promise.all(
      provinces.map(async (province) => {
        const cityRows = await prisma.set_shipping.findMany({ where: { province_id: province.id } });

        const cities = await Promise.all(
          cityRows.map(async (city) => {
            const cityProvince = await prisma.provinces.findUnique({ where: { id: city.province_id } });
            const zoneRows = await prisma.address_zone.findMany({ where: { city_id: city.id } });

            const zones = await Promise.all(
              zoneRows.map(async (zone) => {
                const zoneCity = await prisma.set_shipping.findUnique({ where: { id: zone.city_id } });
                const zoneCityProvince = zoneCity
                  ? await prisma.provinces.findUnique({ where: { id: zoneCity.province_id } })
                  : null;
                return { ...zone, city: zoneCity ? { ...zoneCity, province: zoneCityProvince ?? null } : null };
              }),
            );

            return { ...city, province: cityProvince ?? null, zones };
          }),
        );

        return { id: Number(province.id), name: province.province_name, cities };
      }),
    );

    return successResponse("Address dropdown data loaded successfully", { data });
  } catch (error) {
    console.error("Failed to load address hierarchy", error);
    return serverErrorResponse("Failed to load address data", error);
  }
}
