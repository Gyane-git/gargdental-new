import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assetUrl } from "@/lib/assetUrl";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports OrderController::get_return_orders_list (OrderController.php:1515-1548). `images` is
// stored as a JSON array of filenames under storage/app/public/returns (see the return/route.ts
// sibling that writes it) - the storefront (app/Return-list/Returnlist.js) reads `image_full_url`
// as an array of resolved URLs, which was never computed here.
function returnImageFullUrls(images: string | null): string[] {
  if (!images) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(images);
  } catch {
    parsed = [images];
  }
  const list = Array.isArray(parsed) ? parsed : [images];
  return list.map((img) => assetUrl(String(img), "returns")).filter((url): url is string => url !== null);
}

/**
 * @swagger
 * /api/v1/customer/order/return-list:
 *   get:
 *     summary: List the authenticated customer's order returns
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Return list fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Return List fetched successfully." }
 *                 returns:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: order_returns row plus image_full_url, an array of resolved URLs for the stored return images.
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
    const customerOrders = await prisma.orders.findMany({
      where: { customer_id: auth.id },
      select: { order_id: true },
    });
    const returnRows = await prisma.order_returns.findMany({
      where: { order_id: { in: customerOrders.map((o) => o.order_id) } },
    });
    const returns = returnRows.map((row) => ({ ...row, image_full_url: returnImageFullUrls(row.images) }));
    return successResponse("Return List fetched successfully.", { returns });
  } catch (error) {
    console.error("Exception occurred while fetching return orders", error);
    return serverErrorResponse("Failed to get return orders", error);
  }
}
