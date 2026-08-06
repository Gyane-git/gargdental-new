import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { serializeProduct } from "@/lib/productSerializer";
import { assetUrl } from "@/lib/assetUrl";
import { nowForDb } from "@/lib/dbTime";

async function saveFile(file: File, subdir: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = `${Date.now()}-${file.name}`;
  const dir = path.join(mediaStoragePath(), subdir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), buffer);
  return fileName;
}

// Ports gargnew's app/api/v1/products/[id]/route.js. Admin-only path (mobile uses
// /products/details/{code} etc.), gated by requireAdminAuth on every verb.
/**
 * @swagger
 * /api/v1/products/{id}:
 *   get:
 *     summary: Get a single product (with variations) by numeric id (admin only)
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
 *     responses:
 *       200:
 *         description: Product fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 product:
 *                   type: object
 *                   description: Serialized product (lib/productSerializer.ts) plus a `variations` array.
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No product with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Product not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Server error" }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const row = await prisma.products.findUnique({ where: { id: BigInt(id) } });
    if (!row) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    const serialized = await serializeProduct(row, { withCategory: true, withBrand: true });
    const variationRows = await prisma.product_variations.findMany({ where: { product_code: row.product_code }, orderBy: { id: "asc" } });

    // Admin-only, alongside the existing files_full_url (a bare string[] other consumers rely on
    // and can't change shape under) - carries the real product_images.id so the edit page can
    // target a DELETE at one specific gallery row instead of only ever being able to add more.
    const galleryImageRows = await prisma.product_images.findMany({ where: { product_code: row.product_code }, orderBy: { id: "asc" } });
    const galleryImages = galleryImageRows.map((img) => ({
      id: Number(img.id),
      image_full_url: assetUrl(img.image_path, `backend/productimages/${row.product_code}`),
    }));

    let variations = variationRows.map((v) => {
      let attributes: Record<string, unknown> = {};
      try {
        attributes = typeof v.attributes === "string" ? JSON.parse(v.attributes) : (v.attributes as unknown as Record<string, unknown>);
      } catch {
        attributes = {};
      }
      return {
        id: Number(v.id),
        product_code: v.product_code,
        product_name: attributes.name || row.product_name,
        actual_price: Number(v.price),
        sell_price: Number(attributes.sell_price ?? v.price ?? 0),
        available_quantity: Number(attributes.available_qty ?? v.stock ?? 0),
        stock_quantity: Number(v.stock),
        attributes,
        sku: v.sku,
      };
    });

    if (row.has_variations === 1 && variations.length === 0) {
      variations = [
        {
          id: 0,
          product_code: row.product_code,
          product_name: row.product_name,
          actual_price: Number(row.actual_price || 0),
          sell_price: Number(row.sell_price || 0),
          available_quantity: Number(row.available_quantity || 0),
          stock_quantity: Number(row.stock_quantity || 0),
          attributes: { name: row.product_name },
          sku: null,
        },
      ];
    }

    return NextResponse.json({ success: true, product: { ...serialized, variations, gallery_images: galleryImages } });
  } catch (error) {
    console.error("GET PRODUCT ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/products/{id}:
 *   put:
 *     summary: Update a product (admin only)
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
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               product_name: { type: string }
 *               product_code: { type: string }
 *               slug: { type: string }
 *               product_description: { type: string }
 *               key_specifications: { type: string }
 *               packaging: { type: string }
 *               warranty: { type: string }
 *               category_id: { type: string }
 *               brand_id: { type: string }
 *               delivery_target_days: { type: string }
 *               actual_price: { type: number }
 *               sell_price: { type: number }
 *               discount: { type: number }
 *               available_quantity: { type: number }
 *               stock_quantity: { type: number }
 *               product_location: { type: string }
 *               has_variations: { type: integer, example: 0 }
 *               flash_sale: { type: integer, example: 0 }
 *               weekly_offer: { type: integer, example: 0 }
 *               special_offer: { type: integer, example: 0 }
 *               today_deals: { type: integer, example: 0 }
 *               status: { type: integer, example: 1 }
 *               existing_image: { type: string, description: "Kept when main_image isn't re-uploaded." }
 *               existing_catalogue: { type: string, description: "Kept when product_catalogue isn't re-uploaded." }
 *               remove_image: { type: string, example: "1", description: "Send \"1\" to clear the existing main image." }
 *               main_image: { type: string, format: binary }
 *               product_catalogue: { type: string, format: binary }
 *               gallery_images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *               variations:
 *                 type: string
 *                 description: JSON-stringified array of { name, actual_price, sell_price, available_qty, stock_qty, sku }, required when has_variations=1.
 *               variation_image_0: { type: string, format: binary, description: "Per-index variation image, keyed variation_image_{i}." }
 *     responses:
 *       200:
 *         description: Product updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Product updated successfully" }
 *       400:
 *         description: Missing product_name, or an invalid `variations` JSON payload.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Product name is required" }
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
 *                 message: { type: string, example: "Server error" }
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const formData = await req.formData();

    const product_name = String(formData.get("product_name") || "");
    if (!product_name) {
      return NextResponse.json({ success: false, message: "Product name is required" }, { status: 400 });
    }

    const product_code = String(formData.get("product_code") || "");
    const slug = String(formData.get("slug") || "");
    const product_description = String(formData.get("product_description") || "");
    const key_specifications = String(formData.get("key_specifications") || "");
    const packaging = String(formData.get("packaging") || "");
    const warranty = String(formData.get("warranty") || "");
    const category_id = formData.get("category_id");
    const brand_id = formData.get("brand_id");
    const delivery_target_days = (formData.get("delivery_target_days") as string) || null;
    let actual_price = Number(formData.get("actual_price") || 0);
    let sell_price = Number(formData.get("sell_price") || 0);
    const discount = Number(formData.get("discount") || 0);
    let available_quantity = Number(formData.get("available_quantity") || 0);
    let stock_quantity = Number(formData.get("stock_quantity") || 0);
    const product_location = String(formData.get("product_location") || "");
    const has_variations = Number(formData.get("has_variations") ?? 0);
    const flash_sale = Number(formData.get("flash_sale") ?? 0);
    const weekly_offer = Number(formData.get("weekly_offer") ?? 0);
    const special_offer = Number(formData.get("special_offer") ?? 0);
    const today_deals = Number(formData.get("today_deals") ?? 0);
    const status = Number(formData.get("status") ?? 1);
    const existingImage = String(formData.get("existing_image") || "");
    const existingCatalogue = String(formData.get("existing_catalogue") || "");
    const removeImage = formData.get("remove_image") === "1";
    const imageFile = formData.get("main_image");
    const catalogueFile = formData.get("product_catalogue");
    const galleryImages = formData.getAll("gallery_images").filter((f): f is File => f instanceof File && f.size > 0);

    let imagePath = existingImage;
    if (removeImage) imagePath = "";
    if (imageFile instanceof File && imageFile.size > 0) {
      imagePath = await saveFile(imageFile, `backend/productimages/${product_code}`);
    }

    let cataloguePath = existingCatalogue;
    if (catalogueFile instanceof File && catalogueFile.size > 0) {
      cataloguePath = await saveFile(catalogueFile, `backend/productcatalogue/${product_code}`);
    }

    const galleryPaths: string[] = [];
    for (const galleryImage of galleryImages) {
      galleryPaths.push(await saveFile(galleryImage, `backend/productimages/${product_code}`));
    }

    const categoryIdValue = !category_id || category_id === "" || category_id === "null" ? null : Number(category_id);
    const brandIdValue = !brand_id || brand_id === "" || brand_id === "null" ? null : Number(brand_id);

    interface VariationInput {
      name?: string;
      actual_price?: number;
      sell_price?: number;
      available_qty?: number;
      stock_qty?: number;
      sku?: string;
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

    if (has_variations === 1 && variations.length > 0) {
      const actualPrices = variations.map((v) => Number(v.actual_price || 0)).filter((n) => n > 0);
      const sellPrices = variations.map((v) => Number(v.sell_price || 0)).filter((n) => n > 0);
      if (actualPrices.length) actual_price = Math.max(...actualPrices);
      if (sellPrices.length) sell_price = Math.min(...sellPrices);
      available_quantity = variations.reduce((sum, v) => sum + Number(v.available_qty || 0), 0);
      stock_quantity = variations.reduce((sum, v) => sum + Number(v.stock_qty || 0), 0);
    }

    await prisma.products.update({
      where: { id: BigInt(id) },
      data: {
        product_name,
        product_code,
        slug,
        product_description,
        key_specifications,
        packaging,
        warranty,
        category_id: categoryIdValue,
        brand_id: brandIdValue,
        delivery_target_days,
        actual_price,
        sell_price,
        discount,
        available_quantity,
        stock_quantity,
        product_location,
        has_variations,
        flash_sale,
        weekly_offer,
        special_offer,
        today_deals,
        status,
        main_image: imagePath,
        product_catalogue: cataloguePath,
        updated_at: nowForDb(),
      },
    });

    if (has_variations === 1) {
      await prisma.product_variations.deleteMany({ where: { product_code } });

      for (let i = 0; i < variations.length; i++) {
        const variation = variations[i] || {};
        const variationImageFile = formData.get(`variation_image_${i}`);
        let variationImage = "";
        if (variationImageFile instanceof File && variationImageFile.size > 0) {
          variationImage = await saveFile(variationImageFile, `backend/productimages/${product_code}`);
        }

        await prisma.product_variations.create({
          data: {
            product_code,
            attributes: JSON.stringify({
              name: variation.name || "",
              image: variationImage,
              sell_price: Number(variation.sell_price || 0),
              available_qty: Number(variation.available_qty || 0),
            }),
            price: Number(variation.actual_price || 0),
            stock: Number(variation.stock_qty || 0),
            sku: variation.sku || `${product_code}-${i + 1}`,
            created_at: nowForDb(),
            updated_at: nowForDb(),
          },
        });
      }
    } else {
      // Product no longer has variations - drop the old rows so they can't resurface (and
      // silently override actual_price/sell_price again, see the derivation above) if variations
      // is switched back on in a later edit without anyone re-entering them.
      await prisma.product_variations.deleteMany({ where: { product_code } });
    }

    for (const galleryPath of galleryPaths) {
      await prisma.product_images.create({
        data: { product_code, image_path: galleryPath, created_at: nowForDb(), updated_at: nowForDb() },
      });
    }

    return NextResponse.json({ success: true, message: "Product updated successfully" });
  } catch (error) {
    console.error("PUT PRODUCT ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/products/{id}:
 *   patch:
 *     summary: Publish/unpublish a product by toggling its status (admin only)
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: integer
 *                 description: 1 to publish, anything else unpublishes (stored as 0).
 *                 example: 1
 *     responses:
 *       200:
 *         description: Status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Product published successfully" }
 *                 status: { type: integer, example: 1 }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No product with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Product not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Server error" }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const status = body?.status === 1 || body?.status === "1" ? 1 : 0;

    try {
      await prisma.products.update({ where: { id: BigInt(id) }, data: { status, updated_at: nowForDb() } });
    } catch {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: status === 1 ? "Product published successfully" : "Product unpublished successfully",
      status,
    });
  } catch (error) {
    console.error("PATCH PRODUCT STATUS ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

// Ports gargnew's DELETE - cascades child rows by product_code (cart_items has a real FK, must
// go first), then best-effort removes the on-disk files.
/**
 * @swagger
 * /api/v1/products/{id}:
 *   delete:
 *     summary: Delete a product and its dependent rows/files (admin only)
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
 *     responses:
 *       200:
 *         description: Product deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Product deleted successfully" }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No product with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Product not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Server error" }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const product = await prisma.products.findUnique({ where: { id: BigInt(id) } });
    if (!product) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    }

    const galleryImages = await prisma.product_images.findMany({ where: { product_code: product.product_code } });

    await prisma.$transaction([
      prisma.cart_items.deleteMany({ where: { product_code: product.product_code } }),
      prisma.order_items.deleteMany({ where: { product_code: product.product_code } }),
      prisma.product_images.deleteMany({ where: { product_code: product.product_code } }),
      prisma.product_reviews.deleteMany({ where: { product_code: product.product_code } }),
      prisma.product_variations.deleteMany({ where: { product_code: product.product_code } }),
      prisma.recommended_products.deleteMany({ where: { product_code: product.product_code } }),
      prisma.wishlist.deleteMany({ where: { product_code: product.product_code } }),
      prisma.products.delete({ where: { id: BigInt(id) } }),
    ]);

    const dir = path.join(mediaStoragePath(), `backend/productimages/${product.product_code}`);
    const filesToDelete = [...(product.main_image ? [product.main_image] : []), ...galleryImages.map((g) => g.image_path).filter((p): p is string => Boolean(p))];
    for (const fileName of filesToDelete) {
      try {
        await unlink(path.join(dir, fileName));
      } catch {
        // already gone - ignore
      }
    }

    return NextResponse.json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error("DELETE PRODUCT ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
