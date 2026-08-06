import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports ReviewController::addReview (ReviewController.php:53-164). Deliberate deviation from the
// dominant envelope: 422 (not 403) with `status` (not `success`) and raw Laravel MessageBag
// `{field: [messages]}` errors (not the {code,message} array from Helpers::error_processor) -
// this is the one documented exception noted throughout this codebase.
/**
 * @swagger
 * /api/v1/customer/reviews/add:
 *   post:
 *     summary: Submit a product review for a delivered order (mobile app)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating, review_detail, product_code, order_id]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5, example: 5 }
 *               review_detail: { type: string, example: "Great product, fast shipping." }
 *               product_code: { type: string, example: "PRD-1001" }
 *               order_id:
 *                 type: integer
 *                 description: Must reference an order (any customer's) with order_status "delivered".
 *                 example: 123
 *               image_path:
 *                 description: One or more base64 data URIs (data:image/<ext>;base64,<data>), saved under storage/reviews/{product_code}.
 *                 oneOf:
 *                   - { type: string }
 *                   - { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Review saved successfully; the matching order_items row is marked reviewed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Thank you for your review!" }
 *                 data:
 *                   type: object
 *                   description: The created product_reviews row.
 *       401:
 *         description: Missing/invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       422:
 *         description: "Validation errors. Deliberate deviation from the standard envelope - `status` (not `success`) and a raw `{field: [messages]}` bag (not the {code,message} array)."
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation errors" }
 *                 errors:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items: { type: string }
 *                   example: { rating: ["The rating must be between 1 and 5."], order_id: ["The selected order id is invalid."] }
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
  const { rating, review_detail, product_code, order_id, image_path } = body as {
    rating?: number;
    review_detail?: string;
    product_code?: string;
    order_id?: number;
    image_path?: string | string[];
  };

  const fieldErrors: Record<string, string[]> = {};
  if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) {
    fieldErrors.rating = ["The rating must be between 1 and 5."];
  }
  if (!review_detail) fieldErrors.review_detail = ["The review detail field is required."];
  if (!product_code) fieldErrors.product_code = ["The product code field is required."];
  if (order_id === undefined || order_id === null || !Number.isInteger(order_id)) {
    fieldErrors.order_id = ["The order id field is required."];
  } else if (!(await prisma.orders.findFirst({ where: { order_id: BigInt(order_id), order_status: "delivered" } }))) {
    fieldErrors.order_id = ["The selected order id is invalid."];
  }
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ status: false, message: "Validation errors", errors: fieldErrors }, { status: 422 });
  }

  try {
    let savedImagePath: string | null = null;

    if (image_path && (Array.isArray(image_path) ? image_path.length > 0 : image_path)) {
      const folder = `reviews/${product_code}`;
      const dir = path.join(mediaStoragePath(), folder);
      await mkdir(dir, { recursive: true });

      const images = Array.isArray(image_path) ? image_path : [image_path];
      const savedImages: string[] = [];

      for (const imageData of images) {
        const match = /^data:image\/(\w+);base64,(.+)$/.exec(imageData);
        const extension = match ? match[1].toLowerCase() : "png";
        const data = match ? match[2] : imageData;
        const imageName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
        await writeFile(path.join(dir, imageName), Buffer.from(data, "base64"));
        savedImages.push(`${folder}/${imageName}`);
      }

      savedImagePath = JSON.stringify(savedImages);
    }

    const review = await prisma.product_reviews.create({
      data: {
        customer_id: auth.id,
        product_code: product_code as string,
        order_id: String(order_id),
        name: auth.full_name,
        email: auth.email,
        review_detail: review_detail as string,
        rating: rating as number,
        image_path: savedImagePath,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    await prisma.order_items.updateMany({
      where: { order_id: BigInt(order_id as number), product_code: product_code as string },
      data: { reviewed: 1 },
    });

    return NextResponse.json(
      { success: true, message: "Thank you for your review!", data: review },
      { status: 201 },
    );
  } catch (error) {
    console.error("Review Insert Error", error);
    return serverErrorResponse("Failed to give review.", error);
  }
}
