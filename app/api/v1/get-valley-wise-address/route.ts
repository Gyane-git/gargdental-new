import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Ports SettingController::get_valley_wise_address (SettingController.php:81-85). Note: this
// returns a BARE array, no {success,message} envelope at all - matches Laravel's
// `response()->json($shippings)` exactly.
/**
 * @swagger
 * /api/v1/get-valley-wise-address:
 *   get:
 *     summary: List shipping/city rows for the Kathmandu and Lalitpur valley
 *     tags: [Addresses]
 *     responses:
 *       200:
 *         description: Shipping rows fetched successfully. Returns a bare JSON array (no {success,message} envelope), matching Laravel's `response()->json($shippings)`.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 description: A set_shipping row (id, province_id, city, shipping_cost, apply_shipping, remarks, created_at, updated_at).
 */
export async function GET() {
  const shippings = await prisma.set_shipping.findMany({
    where: { OR: [{ city: { startsWith: "Kathmandu" } }, { city: { startsWith: "Lalitpur" } }] },
  });
  return NextResponse.json(shippings);
}
