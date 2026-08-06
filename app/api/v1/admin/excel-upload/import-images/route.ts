import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { nowForDb } from "@/lib/dbTime";
import { parseExcelBuffer, normalizeImagePath, collectGalleryPathsFromRow, pickRowValue } from "@/lib/excelUpload";

// Ports gargnew's app/api/v1/admin/excel-upload/import-images/route.js.
/**
 * @swagger
 * /api/v1/admin/excel-upload/import-images:
 *   post:
 *     summary: Bulk-link product images from an uploaded spreadsheet (admin token)
 *     description: >
 *       Each row must have a product_code plus a main_image and/or gallery image path column
 *       (image_1/image_2/gallery_1, etc). Matching products get main_image updated and any new
 *       gallery paths inserted into product_images.
 *     tags: [AdminExcelUpload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: .xlsx, .xls or .csv file.
 *     responses:
 *       200:
 *         description: Import finished (per-row errors are reported in `errors` rather than failing the whole request).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 updated: { type: integer, description: Products whose images were updated. }
 *                 imagesLinked: { type: integer, description: New gallery image rows created. }
 *                 errors:
 *                   type: array
 *                   items: { type: string }
 *       400:
 *         description: Missing file, wrong file type, or empty workbook.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 *       401:
 *         description: Missing or invalid admin token.
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
export async function POST(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return Response.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file !== "object" || !(file as File).size) {
      return Response.json({ success: false, message: "Excel file is required." }, { status: 400 });
    }

    const name = String((file as File).name || "").toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
      return Response.json({ success: false, message: "Only .xlsx, .xls or .csv files are allowed." }, { status: 400 });
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const rows = parseExcelBuffer(buffer);

    if (!rows.length) {
      return Response.json({ success: false, message: "Excel file is empty." }, { status: 400 });
    }

    let updated = 0;
    let imagesLinked = 0;
    const errors: string[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;

      try {
        const product_code = String(pickRowValue(row, ["product_code", "productcode", "code"]) || "").trim();
        if (!product_code) {
          errors.push(`Row ${rowNumber}: product_code is required.`);
          continue;
        }

        const product = await prisma.products.findFirst({ where: { product_code } });
        if (!product) {
          errors.push(`Row ${rowNumber}: product "${product_code}" not found.`);
          continue;
        }

        const mainImage = normalizeImagePath(pickRowValue(row, ["main_image", "image", "image_path", "mainimage", "thumbnail"]));
        const galleryImages = collectGalleryPathsFromRow(row);

        if (!mainImage && !galleryImages.length) {
          errors.push(`Row ${rowNumber}: no image paths found. Fill main_image or image_1/image_2/gallery_1 columns.`);
          continue;
        }

        if (mainImage) {
          await prisma.products.update({ where: { id: product.id }, data: { main_image: mainImage, updated_at: nowForDb() } });
        }

        for (const imagePath of galleryImages) {
          if (mainImage && imagePath === mainImage) continue;

          const existing = await prisma.product_images.findFirst({ where: { product_code, image_path: imagePath } });
          if (existing) continue;

          await prisma.product_images.create({
            data: { product_code, image_path: imagePath, created_at: nowForDb(), updated_at: nowForDb() },
          });
          imagesLinked += 1;
        }

        updated += 1;
      } catch (rowError) {
        errors.push(`Row ${rowNumber}: ${rowError instanceof Error ? rowError.message : "Failed to import images."}`);
      }
    }

    return Response.json({
      success: true,
      message: `Import successful! Products updated: ${updated}, Gallery images linked: ${imagesLinked}.`,
      updated,
      imagesLinked,
      errors,
    });
  } catch (error) {
    console.error("IMPORT IMAGES ERROR:", error);
    return Response.json({ success: false, message: error instanceof Error ? error.message : "Failed to import images." }, { status: 500 });
  }
}
