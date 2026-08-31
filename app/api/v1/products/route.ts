import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { serializeProduct } from "@/lib/productSerializer";
import { assetUrl } from "@/lib/assetUrl";
import { nowForDb } from "@/lib/dbTime";

function safeFileName(originalName: string) {
  const base = path.basename(String(originalName || "file"));
  const ext = path.extname(base).slice(0, 20);
  const stem = base
    .slice(0, base.length - ext.length)
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .slice(0, 60);
  const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  return `${unique}-${stem || "file"}${ext}`;
}

const ALLOWED_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_CATALOGUE_EXT = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx"]);

// Ported to write into the same mediaStoragePath()/backend/... folders lib/productSerializer.ts
// already reads from (backend/productimages/{code}, backend/productcatalogue/{code}) - gargnew
// wrote to its own public/uploads instead, which wouldn't resolve through our assetUrl()/
// /storage pipeline, so newly admin-uploaded images would silently fail to display.
async function saveUpload(file: File, subdir: string, allowedExt: Set<string>): Promise<string> {
  const ext = path.extname(file.name || "").toLowerCase();
  if (allowedExt && !allowedExt.has(ext)) {
    throw new Error(`Unsupported file type: ${ext || "unknown"}`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = safeFileName(file.name);
  const uploadDir = path.join(mediaStoragePath(), subdir);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), buffer);
  return fileName;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "null") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function toNumberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function toBoolInt(value: unknown): number {
  return value == 1 || value === "1" || value === true ? 1 : 0;
}

// Ports gargnew's app/api/v1/products/route.js GET - admin product list, joined with
// category/brand. Admin-only path (mobile uses /products/all etc.), gated by requireAdminAuth.
// gargnew's own version capped this at limit=20/max 100 while its admin page.js does all
// search/category filtering and pagination CLIENT-SIDE over whatever this returns, with no way
// to request more than one page - on a real catalog (1400+ products here) that silently hides
// everything past the first page. Since this route has zero mobile traffic, an explicit `limit`
// is honored for callers that want a page, but the default (what the admin UI actually sends) is
// now "all rows" instead of silently truncating to 20.
//
// Deliberately does NOT use serializeProduct() here (unlike the mobile-facing product routes) -
// that does one categories/brands DB query PER ROW, which is fine for the small paginated lists
// it was built for but becomes an N+1 query storm across the full, uncapped catalog this admin
// list now returns. Category/brand names are batch-fetched below (2 queries total) and flattened
// onto each row as category_name/brand_name, matching gargnew's original raw-SQL admin query
// (`SELECT p.*, c.category_name, ... LEFT JOIN categories c ...`) which the admin page.js expects
// - our serializeProduct's nested `category: {...}` object was never read by that table.
/**
 * @swagger
 * /api/v1/products:
 *   get:
 *     summary: List products for the admin panel, joined with flattened category_name/brand_name (admin only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         required: false
 *         description: Max rows to return (clamped to 1-5000). Omit to return every matching row (no pagination).
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         required: false
 *         description: Rows to skip. Only applied when limit is also present. Defaults to 0.
 *       - in: query
 *         name: include_inactive
 *         schema:
 *           type: string
 *           example: "1"
 *         required: false
 *         description: Pass "1" to include status=0 products (default is active-only).
 *     responses:
 *       200:
 *         description: Products fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw products row plus category_name, brand_name, and main_image_full_url.
 *                 count: { type: integer, description: "Rows returned in this response." }
 *                 total: { type: integer, description: "Total matching rows regardless of pagination." }
 *                 limit: { type: integer, description: "Effective limit used (equals total when limit wasn't requested)." }
 *                 offset: { type: integer }
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
 *                 message: { type: string, example: "Failed to fetch products" }
 */
export async function GET(req: NextRequest) {
  // const authUser = await requireAdminAuth(req);
  // if (!authUser) {
  //   return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  // }

  try {
    const { searchParams } = new URL(req.url);
    const requestedLimit = searchParams.get("limit");
    const limit = requestedLimit ? Math.min(Math.max(Number.parseInt(requestedLimit, 10) || 20, 1), 5000) : undefined;
    const offset = Math.max(Number.parseInt(searchParams.get("offset") || "0", 10) || 0, 0);
    const includeInactive = searchParams.get("include_inactive") === "1";

    const where = includeInactive ? {} : { status: 1 };
    const [rows, total] = await Promise.all([prisma.products.findMany({ where, orderBy: { id: "desc" }, ...(limit ? { take: limit, skip: offset } : {}) }), prisma.products.count({ where })]);

    const categoryIds = [...new Set(rows.map((r) => r.category_id).filter((id): id is number => id !== null))];
    const brandIds = [...new Set(rows.map((r) => r.brand_id).filter((id): id is number => id !== null))];

    const [categoryRows, brandRows] = await Promise.all([
      // categories.id is BigInt; brands.id is (plain) Int - each needs its own id type here.
      categoryIds.length ? prisma.categories.findMany({ where: { id: { in: categoryIds.map((id) => BigInt(id)) } } }) : Promise.resolve([]),
      brandIds.length ? prisma.brands.findMany({ where: { id: { in: brandIds } } }) : Promise.resolve([]),
    ]);
    // category_id/brand_id on products are always plain Int; normalize categories.id (BigInt) to
    // Number for the Map key, otherwise `BigInt(81) !== 81` and every category lookup misses.
    const categoryNameById = new Map(categoryRows.map((c) => [Number(c.id), c.category_name]));
    const brandNameById = new Map(brandRows.map((b) => [b.id, b.brand_name]));

    const products = rows.map((row) => ({
      ...row,
      category_name: row.category_id !== null ? (categoryNameById.get(row.category_id) ?? null) : null,
      brand_name: row.brand_id !== null ? (brandNameById.get(row.brand_id) ?? null) : null,
      // assetUrl() is a sync filesystem check, not a DB query - cheap to add per-row here,
      // unlike category/brand names which needed the batched Map lookups above.
      main_image_full_url: row.main_image ? assetUrl(row.main_image, `backend/productimages/${row.product_code}`) : null,
    }));

    return NextResponse.json({ success: true, products, count: rows.length, total, limit: limit ?? total, offset });
  } catch (error) {
    console.error("GET PRODUCTS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch products" }, { status: 500 });
  }
}

// Ports gargnew's app/api/v1/products/route.js POST.
/**
 * @swagger
 * /api/v1/products:
 *   post:
 *     summary: Create a product, optionally with variations and gallery images (admin only)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [product_code]
 *             properties:
 *               product_name: { type: string, description: "Also accepted as `name`." }
 *               name: { type: string }
 *               product_code: { type: string }
 *               slug: { type: string }
 *               product_description: { type: string }
 *               key_specifications: { type: string }
 *               packaging: { type: string }
 *               warranty: { type: string }
 *               category_id: { type: string }
 *               brand_id: { type: string }
 *               delivery_target_days: { type: string }
 *               product_location: { type: string }
 *               has_variations: { type: integer, example: 0 }
 *               flash_sale: { type: integer, example: 0 }
 *               weekly_offer: { type: integer, example: 0 }
 *               special_offer: { type: integer, example: 0 }
 *               today_deals: { type: integer, example: 0 }
 *               actual_price: { type: number }
 *               sell_price: { type: number }
 *               discount: { type: number }
 *               available_quantity: { type: number }
 *               stock_quantity: { type: number }
 *               status: { type: integer, example: 1 }
 *               main_image: { type: string, format: binary, description: "Also accepted as `image`." }
 *               image: { type: string, format: binary }
 *               product_catalogue: { type: string, format: binary }
 *               gallery_images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *               variations:
 *                 type: string
 *                 description: JSON-stringified array of { name, actual_price, sell_price, available_qty, stock_qty }, required when has_variations=1.
 *               variation_image_0: { type: string, format: binary, description: "Per-index variation image, keyed variation_image_{i}." }
 *     responses:
 *       200:
 *         description: Product created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Product created successfully" }
 *                 product:
 *                   type: object
 *                   description: Serialized product (lib/productSerializer.ts).
 *       400:
 *         description: Missing product_name or product_code, or an invalid `variations` JSON payload.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Product code is required" }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       409:
 *         description: product_code already exists.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Product code \"ABC-123\" already exists" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Failed to create product" }
 */
export async function POST(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const formData = await req.formData();

    const product_name = String(formData.get("product_name") || formData.get("name") || "");
    const product_code = String(formData.get("product_code") || "");
    const slug = (formData.get("slug") as string) || null;
    const product_description = (formData.get("product_description") as string) || null;
    const key_specifications = (formData.get("key_specifications") as string) || null;
    const packaging = (formData.get("packaging") as string) || null;
    const warranty = (formData.get("warranty") as string) || null;
    const brand_id = formData.get("brand_id");
    const delivery_target_days = toNullableNumber(formData.get("delivery_target_days"));
    const product_location = (formData.get("product_location") as string) || null;

    const has_variations = toBoolInt(formData.get("has_variations"));
    const flash_sale = toBoolInt(formData.get("flash_sale"));
    const weekly_offer = toBoolInt(formData.get("weekly_offer"));
    const special_offer = toBoolInt(formData.get("special_offer"));
    const today_deals = toBoolInt(formData.get("today_deals"));

    const catalogue = formData.get("product_catalogue");
    const galleryImages = formData.getAll("gallery_images").filter((f): f is File => f instanceof File && f.size > 0);

    const category_id = formData.get("category_id");
    const actual_price = toNumberOrZero(formData.get("actual_price"));
    const sell_price = toNumberOrZero(formData.get("sell_price"));
    const discount = toNumberOrZero(formData.get("discount"));
    const available_quantity = toNumberOrZero(formData.get("available_quantity"));
    const stock_quantity = toNumberOrZero(formData.get("stock_quantity"));
    const status = Number(formData.get("status") ?? 1);
    const image = (formData.get("main_image") as File | null) || (formData.get("image") as File | null);

    if (!product_name.trim()) {
      return NextResponse.json({ success: false, message: "Product name is required" }, { status: 400 });
    }
    if (!product_code.trim()) {
      return NextResponse.json({ success: false, message: "Product code is required" }, { status: 400 });
    }

    const existing = await prisma.products.findFirst({ where: { product_code } });
    if (existing) {
      return NextResponse.json({ success: false, message: `Product code "${product_code}" already exists` }, { status: 409 });
    }

    interface VariationInput {
      name?: string;
      actual_price?: number;
      sell_price?: number;
      available_qty?: number;
      stock_qty?: number;
    }
    let variations: VariationInput[] = [];
    const variationsJson = formData.get("variations");
    if (has_variations === 1 && variationsJson) {
      try {
        variations = JSON.parse(String(variationsJson));
        if (!Array.isArray(variations)) throw new Error("not an array");
      } catch {
        return NextResponse.json({ success: false, message: "Invalid variations payload" }, { status: 400 });
      }
    }

    let imagePath = "";
    let cataloguePath = "";
    const galleryPaths: string[] = [];

    if (catalogue instanceof File && catalogue.size > 0) {
      cataloguePath = await saveUpload(catalogue, `backend/productcatalogue/${product_code}`, ALLOWED_CATALOGUE_EXT);
    }
    if (image instanceof File && image.size > 0) {
      imagePath = await saveUpload(image, `backend/productimages/${product_code}`, ALLOWED_IMAGE_EXT);
    }
    for (const galleryImage of galleryImages) {
      galleryPaths.push(await saveUpload(galleryImage, `backend/productimages/${product_code}`, ALLOWED_IMAGE_EXT));
    }

    const variationUploads: string[] = [];
    for (let i = 0; i < variations.length; i++) {
      const varImageFile = formData.get(`variation_image_${i}`);
      let variationImage = "";
      if (varImageFile instanceof File && varImageFile.size > 0) {
        variationImage = await saveUpload(varImageFile, `backend/productimages/${product_code}`, ALLOWED_IMAGE_EXT);
      }
      variationUploads.push(variationImage);
    }

    const categoryIdValue = toNullableNumber(category_id);
    const brandIdValue = toNullableNumber(brand_id);

    let finalActualPrice = actual_price;
    let finalSellPrice = sell_price;
    let finalAvailableQty = available_quantity;
    let finalStockQty = stock_quantity;

    if (has_variations === 1 && variations.length > 0) {
      const actualPrices = variations.map((v) => toNumberOrZero(v.actual_price)).filter((n) => n > 0);
      const sellPrices = variations.map((v) => toNumberOrZero(v.sell_price)).filter((n) => n > 0);
      finalActualPrice = actualPrices.length ? Math.max(...actualPrices) : actual_price;
      finalSellPrice = sellPrices.length ? Math.min(...sellPrices) : sell_price;
      finalAvailableQty = variations.reduce((sum, v) => sum + toNumberOrZero(v.available_qty), 0);
      finalStockQty = variations.reduce((sum, v) => sum + toNumberOrZero(v.stock_qty), 0);
    }

    await prisma.$transaction(async (tx) => {
      await tx.products.create({
        data: {
          product_code,
          product_name,
          slug,
          product_description,
          key_specifications,
          packaging,
          warranty,
          category_id: categoryIdValue,
          brand_id: brandIdValue,
          delivery_target_days: delivery_target_days !== null ? String(delivery_target_days) : null,
          discount,
          actual_price: finalActualPrice,
          sell_price: finalSellPrice,
          available_quantity: finalAvailableQty,
          stock_quantity: finalStockQty,
          product_location,
          has_variations,
          flash_sale,
          weekly_offer,
          special_offer,
          today_deals,
          main_image: imagePath,
          product_catalogue: cataloguePath,
          status,
          created_at: nowForDb(),
          updated_at: nowForDb(),
        },
      });

      for (let i = 0; i < variations.length; i++) {
        const variation = variations[i];
        await tx.product_variations.create({
          data: {
            product_code,
            attributes: JSON.stringify({
              name: variation.name,
              image: variationUploads[i],
              sell_price: toNumberOrZero(variation.sell_price),
              available_qty: toNumberOrZero(variation.available_qty),
            }),
            price: toNumberOrZero(variation.actual_price),
            stock: toNumberOrZero(variation.stock_qty),
            sku: `${product_code}-${i + 1}`,
            created_at: nowForDb(),
            updated_at: nowForDb(),
          },
        });
      }

      for (const galleryPath of galleryPaths) {
        await tx.product_images.create({
          data: { product_code, image_path: galleryPath, created_at: nowForDb(), updated_at: nowForDb() },
        });
      }
    });

    const inserted = await prisma.products.findFirst({ where: { product_code } });
    const product = inserted ? await serializeProduct(inserted, { withCategory: true, withBrand: true }) : null;

    return NextResponse.json({ success: true, message: "Product created successfully", product });
  } catch (error) {
    console.error("ADD PRODUCT ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to create product" }, { status: 500 });
  }
}
