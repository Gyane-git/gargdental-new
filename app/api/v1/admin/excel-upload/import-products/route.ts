import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { nowForDb } from "@/lib/dbTime";
import {
  parseExcelBuffer,
  slugify,
  toNumberOrZero,
  generateProductCode,
  pickRowValue,
  resolveCategoryId,
  resolveBrandId,
} from "@/lib/excelUpload";

// Ports gargnew's app/api/v1/admin/excel-upload/import-products/route.js.
/**
 * @swagger
 * /api/v1/admin/excel-upload/import-products:
 *   post:
 *     summary: Bulk create/update products from an uploaded spreadsheet (admin token)
 *     description: >
 *       Matches existing products by product_name (case-sensitive exact match) to decide
 *       create vs update. category_id/brand_id may be given as numeric IDs or as
 *       category_name/brand_name text columns. New products get an auto-generated product_code.
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
 *                 description: >
 *                   .xlsx, .xls or .csv file with columns product_name, category_id/category_name,
 *                   brand_id/brand_name, actual_price, sell_price, available_quantity,
 *                   stock_quantity, delivery_target_days.
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
 *                 created: { type: integer }
 *                 updated: { type: integer }
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

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;

      try {
        const product_name = String(pickRowValue(row, ["product_name", "name", "product", "product_title"]) || "").trim();
        if (!product_name) {
          errors.push(`Row ${rowNumber}: product_name is required.`);
          continue;
        }

        const category_id = await resolveCategoryId(row);
        const brand_id = await resolveBrandId(row);

        if (!category_id) {
          const categoryValue = pickRowValue(row, ["category_id", "category_name", "category"]);
          errors.push(`Row ${rowNumber}: category_id is required. Use category number from Categories List, or category_name column. Found: "${categoryValue || "empty"}".`);
          continue;
        }
        if (!brand_id) {
          const brandValue = pickRowValue(row, ["brand_id", "brand_name", "brand"]);
          errors.push(`Row ${rowNumber}: brand_id is required. Use brand number from Brands List, or brand_name column. Found: "${brandValue || "empty"}".`);
          continue;
        }

        const actual_price = toNumberOrZero(pickRowValue(row, ["actual_price", "actualprice", "price", "mrp"]));
        const sell_price = toNumberOrZero(pickRowValue(row, ["sell_price", "sellprice", "sale_price", "selling_price"]));
        const available_quantity = toNumberOrZero(pickRowValue(row, ["available_quantity", "available_qty", "availableqty", "qty", "quantity"]));
        const stock_quantity = toNumberOrZero(pickRowValue(row, ["stock_quantity", "stock_qty", "stockqty", "stock"]));
        const discount = Math.max(actual_price - sell_price, 0);

        const deliveryRaw = pickRowValue(row, ["delivery_target_days", "delivery_days", "delivery"]);
        const delivery_target_days = deliveryRaw === "" ? null : String(toNumberOrZero(deliveryRaw));

        const existing = await prisma.products.findFirst({ where: { product_name } });

        if (existing) {
          const slug = slugify(`${product_name}-${existing.product_code}`) || existing.product_code.toLowerCase();
          await prisma.products.update({
            where: { id: existing.id },
            data: {
              slug,
              category_id,
              brand_id,
              delivery_target_days,
              discount,
              actual_price,
              sell_price,
              available_quantity,
              stock_quantity,
              updated_at: nowForDb(),
            },
          });
          updated += 1;
        } else {
          const product_code = await generateProductCode();
          const slug = slugify(`${product_name}-${product_code}`) || product_code.toLowerCase();

          await prisma.products.create({
            data: {
              product_code,
              product_name,
              slug,
              category_id,
              brand_id,
              delivery_target_days,
              discount,
              actual_price,
              sell_price,
              available_quantity,
              stock_quantity,
              has_variations: 0,
              status: 1,
              created_at: nowForDb(),
              updated_at: nowForDb(),
            },
          });
          created += 1;
        }
      } catch (rowError) {
        errors.push(`Row ${rowNumber}: ${rowError instanceof Error ? rowError.message : "Failed to import."}`);
      }
    }

    return Response.json({
      success: true,
      message: `Products upload successful! Created: ${created}, Updated: ${updated}.`,
      created,
      updated,
      errors,
    });
  } catch (error) {
    console.error("IMPORT PRODUCTS ERROR:", error);
    return Response.json({ success: false, message: error instanceof Error ? error.message : "Failed to import products." }, { status: 500 });
  }
}
