import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { generateReturnId } from "@/lib/generateReturnId";
import { nowForDb } from "@/lib/dbTime";

// Ports OrderController::add_to_return (OrderController.php:1394-1469) - multipart/form-data
// with binary image uploads (unlike the base64-JSON pattern used elsewhere in this app).
//
// DEVIATION: Laravel fetches $order without a null check before reading $order->order_status -
// for an order_id that doesn't belong to this customer (passes the unscoped `exists:orders,order_id`
// validation rule but fails the customer_id-scoped lookup), that's a null-pointer fatal (500 HTML
// crash), same dead-code-path pattern as get_carts/get_recommended. We return a real 404 instead.
/**
 * @swagger
 * /api/v1/customer/order/return:
 *   post:
 *     summary: Initiate a return for a customer's own delivered order (multipart/form-data, with optional images)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [order_id, reason_id, reason_description]
 *             properties:
 *               order_id: { type: string, description: "orders.order_id; must exist." }
 *               reason_id: { type: string, description: "order_cancel_reasons.id; must exist." }
 *               reason_description: { type: string }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: Optional. Non-empty files are stored under storage/returns.
 *     responses:
 *       201:
 *         description: Order return process initiated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Order return process initiated." }
 *                 return_id: { type: integer }
 *       401:
 *         description: Missing or invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: Field validation errors (standard envelope), OR the order exists but is not in a returnable ("delivered") status (inline `{success:false, message}`, no errors array).
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/ValidationErrorResponse'
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean, example: false }
 *                     message: { type: string, example: "Order cannot be returned in its current status." }
 *       404:
 *         description: No order with that order_id belongs to this customer.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Order not found." }
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

  const formData = await req.formData();
  const order_id = formData.get("order_id");
  const reason_id = formData.get("reason_id");
  const reason_description = formData.get("reason_description");
  const images = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);

  const fieldErrors: Record<string, string> = {};
  if (!order_id) fieldErrors.order_id = "The order id field is required.";
  else if (!(await prisma.orders.findFirst({ where: { order_id: BigInt(String(order_id)) } }))) {
    fieldErrors.order_id = "The selected order id is invalid.";
  }
  if (!reason_id) fieldErrors.reason_id = "The reason id field is required.";
  else if (!(await prisma.order_cancel_reasons.findUnique({ where: { id: BigInt(String(reason_id)) } }))) {
    fieldErrors.reason_id = "The selected reason id is invalid.";
  }
  if (!reason_description) fieldErrors.reason_description = "The reason description field is required.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    const order = await prisma.orders.findFirst({
      where: { order_id: BigInt(String(order_id)), customer_id: auth.id },
    });
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    }
    if (order.order_status !== "delivered") {
      return NextResponse.json({ success: false, message: "Order cannot be returned in its current status." }, { status: 403 });
    }

    await prisma.orders.update({ where: { id: order.id }, data: { order_status: "returned", updated_at: nowForDb() } });

    const returnId = await generateReturnId();

    const imagePaths: string[] = [];
    if (images.length > 0) {
      const dir = path.join(mediaStoragePath(), "returns");
      await mkdir(dir, { recursive: true });
      for (const image of images) {
        const filename = `${Date.now()}_${image.name}`;
        const buffer = Buffer.from(await image.arrayBuffer());
        await writeFile(path.join(dir, filename), buffer);
        imagePaths.push(filename);
      }
    }

    await prisma.order_returns.create({
      data: {
        return_id: BigInt(returnId),
        order_id: order.order_id,
        return_reason: Number(reason_id),
        return_description: String(reason_description),
        images: imagePaths.length > 0 ? JSON.stringify(imagePaths) : null,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    return successResponse("Order return process initiated.", { return_id: returnId }, 201);
  } catch (error) {
    console.error("Order return failed", error);
    return serverErrorResponse("Failed to return order", error);
  }
}
