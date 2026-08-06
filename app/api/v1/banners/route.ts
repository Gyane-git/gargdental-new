import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { serializeProduct } from "@/lib/productSerializer";
import { requireAdminAuth } from "@/lib/adminAuth";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports BannerController::get_banners (BannerController.php:33-47) for the mobile app, PLUS
// gargnew's admin filters on this SAME endpoint (include_inactive, is_offer) - gargnew's admin
// GET already matches the Laravel {success,message,banners} shape exactly, so this is a strict
// superset, not a branch.
/**
 * @swagger
 * /api/v1/banners:
 *   get:
 *     summary: List banners (carousel images), each with its linked product; active only unless include_inactive is set
 *     tags: [Banners]
 *     parameters:
 *       - in: query
 *         name: include_inactive
 *         schema:
 *           type: string
 *         required: false
 *         description: Set to "1" to include inactive banners too (admin use).
 *       - in: query
 *         name: is_offer
 *         schema:
 *           type: string
 *         required: false
 *         description: Filter by the is_offer flag (0 or 1). Omit for no filter.
 *     responses:
 *       200:
 *         description: Banners fetched successfully, newest first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Banners fetched successfully." }
 *                 banners:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw carousel_images row plus image_full_url, mobile_image_full_url, and a serialized product (or null).
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("include_inactive") === "1";
    const isOffer = searchParams.get("is_offer");

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.status = 1;
    if (isOffer !== null) where.is_offer = Number(isOffer);

    const rows = await prisma.carousel_images.findMany({ where, orderBy: { id: "desc" } });
    const banners = await Promise.all(
      rows.map(async (row) => {
        const product = row.product_code ? await prisma.products.findFirst({ where: { product_code: row.product_code } }) : null;
        return {
          ...row,
          image_full_url: assetUrl(row.file_path, "backend/carousel_files"),
          mobile_image_full_url: assetUrl(row.mobile_file_path, "backend/carousel_files"),
          product: product ? await serializeProduct(product) : null,
        };
      }),
    );
    return successResponse("Banners fetched successfully.", { banners });
  } catch (error) {
    console.error("Exception occurred while fetching banners", error);
    return serverErrorResponse("Failed to get banners", error);
  }
}

// Ports gargnew's admin banner-create (app/api/v1/banners/route.js POST). requireAdminAuth
// added (gargnew enforced no auth) - see app/api/v1/categories/route.ts's top comment.
/**
 * @swagger
 * /api/v1/banners:
 *   post:
 *     summary: Create a banner (admin token)
 *     tags: [Banners]
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
 *               product_code: { type: string }
 *               is_offer: { type: string, description: "0 or 1, defaults to 0." }
 *               status: { type: string, description: "0 or 1, defaults to 1." }
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Desktop banner image.
 *               mobile_file:
 *                 type: string
 *                 format: binary
 *                 description: Mobile banner image.
 *     responses:
 *       200:
 *         description: Banner added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Banner added successfully" }
 *       400:
 *         description: Missing product code.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Product is required" }
 *       401:
 *         description: Missing or invalid admin bearer token.
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
export async function POST(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const product_code = String(formData.get("product_code") || "").trim();
    const is_offer = Number(formData.get("is_offer") || 0);
    const status = Number(formData.get("status") || 1);
    const file = formData.get("file");
    const mobileFile = formData.get("mobile_file");

    if (!product_code) {
      return NextResponse.json({ success: false, message: "Product is required" }, { status: 400 });
    }

    const dir = path.join(mediaStoragePath(), "backend/carousel_files");
    await mkdir(dir, { recursive: true });

    let file_path: string | null = null;
    if (file instanceof File && file.name) {
      const filename = `${Date.now()}_${file.name}`;
      await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
      file_path = filename;
    }

    let mobile_file_path: string | null = null;
    if (mobileFile instanceof File && mobileFile.name) {
      const filename = `${Date.now()}_${mobileFile.name}`;
      await writeFile(path.join(dir, filename), Buffer.from(await mobileFile.arrayBuffer()));
      mobile_file_path = filename;
    }

    await prisma.carousel_images.create({
      data: { product_code, file_path, mobile_file_path, is_offer, status, created_at: nowForDb(), updated_at: nowForDb() },
    });

    return NextResponse.json({ success: true, message: "Banner added successfully" });
  } catch (error) {
    console.error("POST ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
