import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/v1/customers/reviews/add/route.js - the web/storefront review-submit
// variant, distinct from the mobile /api/v1/customer/reviews/add (see that route's comment for
// the mobile shape). Customer-authenticated (not admin), different response envelope/validation
// than the mobile route by design (matches gargnew's own two-endpoint split).
/**
 * @swagger
 * /api/v1/customers/reviews/add:
 *   post:
 *     summary: Submit a product review (web/storefront review-submit variant)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_code, order_id, review_detail, rating]
 *             properties:
 *               customer_id: { type: integer, description: "Defaults to the authenticated customer's own id if omitted." }
 *               product_code: { type: string, example: "PRD-1001" }
 *               order_id: { type: integer, example: 123 }
 *               name: { type: string, description: "Defaults to the authenticated customer's full_name if omitted." }
 *               email: { type: string, description: "Defaults to the authenticated customer's email if omitted." }
 *               review_detail: { type: string, description: "Max 500 characters.", example: "Great product." }
 *               rating: { type: number, minimum: 0, maximum: 5, example: 4.5 }
 *               image_path:
 *                 description: A single image path/URL, or an array of them (JSON-stringified when stored).
 *                 oneOf:
 *                   - { type: string }
 *                   - { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Review submitted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Review submitted successfully" }
 *                 review_id: { type: integer, example: 456 }
 *       400:
 *         description: Missing required fields, invalid rating, or review_detail over 500 characters.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "All fields are required" }
 *       401:
 *         description: Missing/invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       409:
 *         description: This email already has a review for this product/order.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "You have already reviewed this product for this order" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Failed to submit review" }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const {
      customer_id = auth.id,
      product_code,
      order_id,
      name,
      email,
      review_detail,
      rating,
      image_path = null,
    } = body;

    const resolvedName = String(name || auth.full_name || "").trim();
    const resolvedEmail = String(email || auth.email || "").trim();

    if (!product_code || !order_id || !resolvedName || !resolvedEmail || !review_detail || !rating) {
      return NextResponse.json({ success: false, message: "All fields are required" }, { status: 400 });
    }

    const ratingNum = parseFloat(rating);
    if (isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) {
      return NextResponse.json({ success: false, message: "Rating must be between 0 and 5" }, { status: 400 });
    }

    if (String(review_detail).length > 500) {
      return NextResponse.json({ success: false, message: "Review must be 500 characters or fewer" }, { status: 400 });
    }

    const normalizedImagePath = Array.isArray(image_path)
      ? JSON.stringify(image_path)
      : typeof image_path === "string"
        ? image_path
        : image_path
          ? JSON.stringify(image_path)
          : null;

    const duplicate = await prisma.product_reviews.findFirst({
      where: { order_id: String(order_id), email: resolvedEmail, product_code },
    });
    if (duplicate) {
      return NextResponse.json({ success: false, message: "You have already reviewed this product for this order" }, { status: 409 });
    }

    const created = await prisma.product_reviews.create({
      data: {
        customer_id: BigInt(customer_id),
        product_code,
        order_id: String(order_id),
        name: resolvedName,
        email: resolvedEmail,
        review_detail,
        rating: ratingNum,
        image_path: normalizedImagePath,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    return NextResponse.json({ success: true, message: "Review submitted successfully", review_id: created.id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/v1/customers/reviews/add]", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to submit review" }, { status: 500 });
  }
}
