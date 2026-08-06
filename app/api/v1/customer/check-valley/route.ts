import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// Ports OrderController::checkValley (OrderController.php:1031-1053). Uses Laravel's
// `$request->validate()` directly (not Validator::make()), which throws a real
// ValidationException - Laravel's actual default JSON shape for that (confirmed against the
// live instance with an Accept: application/json header, which any real API client sends):
// {"message": "<first error>", "errors": {field: [messages]}} at 422 - NOT the app's usual
// {success,message,errors:[{code,message}]}/403 shape.
/**
 * @swagger
 * /api/v1/customer/check-valley:
 *   post:
 *     summary: Check whether one of the authenticated customer's saved addresses is inside the Kathmandu/Lalitpur valley
 *     tags: [Customer]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address_id]
 *             properties:
 *               address_id: { type: integer, example: 12 }
 *     responses:
 *       200:
 *         description: Valley check completed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 inside_valley: { type: boolean, example: true }
 *       401:
 *         description: Missing or invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       422:
 *         description: Real Laravel `$request->validate()` exception shape (NOT the app's usual {success,message,errors:[]} envelope) - address_id missing, or not one of the customer's own saved addresses.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "The address id field is required." }
 *                 errors:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items: { type: string }
 *                   example: { address_id: ["The address id field is required."] }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { address_id } = body as { address_id?: number };

  if (address_id === undefined || address_id === null) {
    return NextResponse.json(
      { message: "The address id field is required.", errors: { address_id: ["The address id field is required."] } },
      { status: 422 },
    );
  }

  const address = await prisma.customer_address_book.findFirst({
    where: { id: BigInt(address_id), customer_id: auth.id },
  });
  if (!address) {
    return NextResponse.json(
      { message: "The selected address id is invalid.", errors: { address_id: ["The selected address id is invalid."] } },
      { status: 422 },
    );
  }

  const city = await prisma.set_shipping.findUnique({ where: { id: address.city_id } });
  const cityName = city?.city ?? null;
  const isValley = Boolean(cityName && /kathmandu|lalitpur/i.test(cityName));

  return NextResponse.json({ success: true, inside_valley: isValley });
}
