import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Backs the delete (x) button on each existing gallery thumbnail in
// app/admin/products/edit/[id]/page.js. The PUT handler on the parent route only ever appends
// new gallery images - there was previously no way to remove one at all, dead or not (see the
// image_full_url:null entries a missing-on-disk file produces, which the edit page has no way to
// clear without this).
/**
 * @swagger
 * /api/v1/products/{id}/gallery-images/{imageId}:
 *   delete:
 *     summary: Remove one gallery image from a product (admin only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: products.id
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: integer
 *         description: product_images.id
 *     responses:
 *       200:
 *         description: Gallery image deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Gallery image deleted successfully" }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No product with this id, or no gallery image with this id belonging to it.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Gallery image not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id, imageId } = await params;
    const product = await prisma.products.findUnique({ where: { id: BigInt(id) } });
    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    // Scoped by product_code, not just the image's own id, so one product's edit page can never
    // be used to delete a gallery row belonging to a different product.
    const image = await prisma.product_images.findFirst({ where: { id: BigInt(imageId), product_code: product.product_code } });
    if (!image) {
      return NextResponse.json({ success: false, message: "Gallery image not found" }, { status: 404 });
    }

    if (image.image_path) {
      try {
        await unlink(path.join(mediaStoragePath(), `backend/productimages/${product.product_code}`, image.image_path));
      } catch {
        // file already gone from disk (this is often exactly why the admin is deleting this row) - ignore
      }
    }

    await prisma.product_images.delete({ where: { id: image.id } });

    return NextResponse.json({ success: true, message: "Gallery image deleted successfully" });
  } catch (error) {
    console.error("DELETE GALLERY IMAGE ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
