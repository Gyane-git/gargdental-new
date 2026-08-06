import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/customers/reviews/list/route.js. requireAdminAuth added.
/**
 * @swagger
 * /api/v1/customers/reviews/list:
 *   get:
 *     summary: List product reviews with search and pagination (admin panel)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *         description: Matches against name, email, product_code, or review_detail (contains).
 *     responses:
 *       200:
 *         description: Reviews fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 reviews:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Selected product_reviews columns (id, customer_id, product_code, order_id, name, email, review_detail, rating, image_path, created_at).
 *                 total: { type: integer, example: 42 }
 *                 page: { type: integer, example: 1 }
 *                 limit: { type: integer, example: 10 }
 *                 totalPages: { type: integer, example: 5 }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Failed to fetch reviews" }
 */
export async function GET(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = (searchParams.get("search") || "").trim();

    const where = search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { product_code: { contains: search } },
            { review_detail: { contains: search } },
          ],
        }
      : {};

    const total = await prisma.product_reviews.count({ where });
    const reviews = await prisma.product_reviews.findMany({
      where,
      select: {
        id: true,
        customer_id: true,
        product_code: true,
        order_id: true,
        name: true,
        email: true,
        review_detail: true,
        rating: true,
        image_path: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json({ success: true, reviews, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("[GET /api/v1/customers/reviews/list]", error);
    return NextResponse.json({ success: false, message: "Failed to fetch reviews" }, { status: 500 });
  }
}
