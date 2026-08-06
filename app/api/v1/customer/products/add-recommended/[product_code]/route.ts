import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports ProductController::add_to_recommended (ProductController.php:870-903): insert-or-ignore
// into recommended_products, then trim the customer's list down to the 10 most recent. Note:
// Laravel doesn't guard against an invalid product_code here (would fatal on `$product->product_code`
// with no try/catch) - we skip the write gracefully instead of crashing, since there's no sane
// JSON shape to replicate for an uncaught PHP fatal.
/**
 * @swagger
 * /api/v1/customer/products/add-recommended/{product_code}:
 *   post:
 *     summary: Record a product as one of the customer's recommended products, trimming to the 10 most recent
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_code
 *         required: true
 *         schema:
 *           type: string
 *         description: products.product_code. Silently a no-op (still returns 200) if it doesn't match a top-level product.
 *     responses:
 *       200:
 *         description: Added to recommended (or silently skipped if product_code was invalid).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Added to recommended" }
 *       401:
 *         description: Missing/invalid customer bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ product_code: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { product_code } = await params;
  const product = await prisma.products.findFirst({ where: { product_code, parent_id: null } });

  if (product) {
    const now = nowForDb();
    await prisma.$transaction(async (tx) => {
      await tx.recommended_products.upsert({
        where: { customer_id_product_code: { customer_id: auth.id, product_code: product.product_code } },
        update: {},
        create: { customer_id: auth.id, product_code: product.product_code, created_at: now, updated_at: now },
      });

      const count = await tx.recommended_products.count({ where: { customer_id: auth.id } });
      if (count > 10) {
        const excess = await tx.recommended_products.findMany({
          where: { customer_id: auth.id },
          orderBy: { created_at: "asc" },
          take: count - 10,
          select: { id: true },
        });
        await tx.recommended_products.deleteMany({ where: { id: { in: excess.map((r) => r.id) } } });
      }
    });
  }

  return successResponse("Added to recommended");
}
