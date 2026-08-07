import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { buildCategoryTree } from "@/lib/categoryTree";
import { PRODUCT_TEMPLATE_HEADERS, IMAGE_TEMPLATE_HEADERS, buildWorkbookBuffer, excelDownloadResponse, flattenCategoryTree } from "@/lib/excelUpload";

// Ports gargnew's app/api/v1/admin/excel-upload/templates/[type]/route.js.
/**
 * @swagger
 * /api/v1/admin/excel-upload/templates/{type}:
 *   get:
 *     summary: Download an import template, or fetch category reference data (admin token)
 *     description: >
 *       For type=categories/brands/products/images this returns an .xlsx file download.
 *       For type=category-list it instead returns JSON with the category tree (used by the
 *       admin UI to resolve category_id when filling the images template). type=images
 *       additionally requires a category_id query param and pre-fills existing product rows
 *       for that category.
 *     tags: [AdminExcelUpload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [categories, brands, products, images, category-list]
 *       - in: query
 *         name: category_id
 *         required: false
 *         schema:
 *           type: integer
 *         description: Required only when type=images.
 *     responses:
 *       200:
 *         description: >
 *           Template workbook (categories/brands/products/images) as an .xlsx file download, or
 *           JSON category tree when type=category-list.
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 categories: { type: array, items: { type: object }, description: Nested category tree. }
 *                 flat: { type: array, items: { type: object }, description: Flattened category tree. }
 *       400:
 *         description: category_id missing when type=images.
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
 *       404:
 *         description: Unknown template type.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unknown template type." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return Response.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { type } = await params;
    const { searchParams } = new URL(request.url);

    if (type === "categories") {
      const rows = await prisma.categories.findMany({ orderBy: { id: "asc" } });
      const buffer = buildWorkbookBuffer(
        "Categories",
        ["id", "category_name", "parent_id", "status"],
        rows.map((row) => [Number(row.id), row.category_name, row.parent_id ?? "", row.status ?? 1]),
      );
      return excelDownloadResponse(buffer, "categories.xlsx");
    }

    if (type === "brands") {
      const rows = await prisma.brands.findMany({ orderBy: { id: "asc" } });
      const buffer = buildWorkbookBuffer("Brands", ["id", "brand_name", "status"], rows.map((row) => [row.id, row.brand_name, row.status ?? 1]));
      return excelDownloadResponse(buffer, "brands.xlsx");
    }

    if (type === "products") {
      const buffer = buildWorkbookBuffer("Products", PRODUCT_TEMPLATE_HEADERS, [["Sample Product", 1, 3, 1, 500, 450, 100, 100]]);
      return excelDownloadResponse(buffer, "product_template.xlsx");
    }

    if (type === "images") {
      const categoryId = Number(searchParams.get("category_id") || 0);
      if (!categoryId) {
        return Response.json({ success: false, message: "category_id is required." }, { status: 400 });
      }

      const products = await prisma.products.findMany({
        where: { category_id: categoryId },
        orderBy: { id: "asc" },
        select: { product_code: true, product_name: true, main_image: true },
      });

      const rows = products.map((product) => [
        product.product_code,
        product.product_name,
        product.main_image || "",
        "/storage/backend/productimages/your-product-code/gallery-1.jpg",
        "/storage/backend/productimages/your-product-code/gallery-2.jpg",
        "",
        "",
        "",
      ]);

      const buffer = buildWorkbookBuffer("Images", IMAGE_TEMPLATE_HEADERS, rows);
      return excelDownloadResponse(buffer, "image_template.xlsx");
    }

    if (type === "category-list") {
      const rows = await prisma.categories.findMany({ orderBy: { id: "asc" } });
      const tree = buildCategoryTree(rows, { onlyActive: false });
      return Response.json({ success: true, categories: tree, flat: flattenCategoryTree(tree as never) });
    }

    return Response.json({ success: false, message: "Unknown template type." }, { status: 404 });
  } catch (error) {
    console.error("EXCEL TEMPLATE ERROR:", error);
    return Response.json({ success: false, message: error instanceof Error ? error.message : "Failed to generate template." }, { status: 500 });
  }
}
