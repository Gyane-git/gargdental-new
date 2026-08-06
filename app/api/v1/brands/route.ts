import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { requireAdminAuth } from "@/lib/adminAuth";
import { isAdminRequest } from "@/lib/adminRequest";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports BrandController::get_brands (BrandController.php:31-45) for the mobile app, PLUS
// gargnew's admin-mode branch on this SAME endpoint (include_inactive + different ordering,
// no `message` key) - opt-in via isAdminRequest so the Laravel-compatible mobile shape is
// untouched by default.
/**
 * @swagger
 * /api/v1/brands:
 *   get:
 *     summary: List active brands (mobile-compatible shape), or all/filtered brands with admin ordering when requested from the admin UI
 *     tags: [Brands]
 *     parameters:
 *       - in: query
 *         name: include_inactive
 *         schema:
 *           type: string
 *         required: false
 *         description: Admin mode only (presence of this param, or `admin=1`, or an /admin Referer, opts into admin mode). "1" also includes inactive brands.
 *     responses:
 *       200:
 *         description: >
 *           Brands fetched successfully. Default (mobile) shape is `{success, message, brands}` with only active
 *           brands. Admin mode (`admin=1`/`include_inactive`/`/admin` Referer) instead returns `{success, brands}`
 *           (no `message`), optionally including inactive brands, sorted by order_wise (nulls last) then id descending.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Brands fetched sucecssfully." }
 *                 brands:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw brands row plus image_full_url.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(req: NextRequest) {
  try {
    if (isAdminRequest(req)) {
      const includeInactive = new URL(req.url).searchParams.get("include_inactive") === "1";
      const rows = await prisma.brands.findMany({ where: includeInactive ? {} : { status: 1 } });
      rows.sort((a, b) => {
        if (a.order_wise === null && b.order_wise === null) return Number(b.id) - Number(a.id);
        if (a.order_wise === null) return 1;
        if (b.order_wise === null) return -1;
        return a.order_wise - b.order_wise || Number(b.id) - Number(a.id);
      });
      const brands = rows.map((row) => ({ ...row, image_full_url: assetUrl(row.image, "backend/brands") }));
      return NextResponse.json({ success: true, brands });
    }

    const rows = await prisma.brands.findMany({ where: { status: 1 } });
    const brands = rows.map((row) => ({ ...row, image_full_url: assetUrl(row.image, "backend/brands") }));
    return successResponse("Brands fetched sucecssfully.", { brands });
  } catch (error) {
    console.error("Exception occurred while fetching brands", error);
    return serverErrorResponse("Failed to get brands", error);
  }
}

// Ports gargnew's admin brand-create (app/api/v1/brands/route.js POST). requireAdminAuth added
// (gargnew enforced no auth at all here) - see app/api/v1/categories/route.ts's top comment.
/**
 * @swagger
 * /api/v1/brands:
 *   post:
 *     summary: Create a brand (admin token)
 *     tags: [Brands]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [brand_name]
 *             properties:
 *               brand_name: { type: string }
 *               top: { type: string, description: "0 or 1, defaults to 0." }
 *               status: { type: string, description: "0 or 1, defaults to 1." }
 *               order_wise: { type: string, description: "Sort order; null when omitted." }
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Brand logo file.
 *     responses:
 *       200:
 *         description: Brand added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Brand added successfully" }
 *       400:
 *         description: Missing brand name.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Brand name is required" }
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
    const brand_name = String(formData.get("brand_name") || "");
    const top = Number(formData.get("top") || 0);
    const status = Number(formData.get("status") || 1);
    const order_wise = formData.get("order_wise") ? Number(formData.get("order_wise")) : null;
    const file = formData.get("image");

    if (!brand_name) {
      return NextResponse.json({ success: false, message: "Brand name is required" }, { status: 400 });
    }

    let image_path = "";
    if (file && typeof file === "object" && (file as File).size > 0) {
      const buffer = Buffer.from(await (file as File).arrayBuffer());
      const filename = `${Date.now()}-${(file as File).name}`;
      const uploadDir = path.join(mediaStoragePath(), "backend/brands");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, filename), buffer);
      image_path = filename;
    }

    await prisma.brands.create({
      data: { brand_name, top, status, order_wise, image: image_path, created_at: nowForDb(), updated_at: nowForDb() },
    });

    return NextResponse.json({ success: true, message: "Brand added successfully" });
  } catch (error) {
    console.error("POST ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/brands:
 *   put:
 *     summary: Update a brand by ID in the request body (admin token)
 *     tags: [Brands]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: integer }
 *               brand_name: { type: string }
 *               image: { type: string, description: "Logo filename; not a file upload on this endpoint." }
 *               top: { type: integer }
 *               status: { type: integer }
 *               order_wise: { type: integer, nullable: true }
 *     responses:
 *       200:
 *         description: Brand updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Brand updated successfully" }
 *       400:
 *         description: Missing brand ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Brand ID is required" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Brand not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Brand not found" }
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
export async function PUT(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, brand_name, image, top, status, order_wise } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: "Brand ID is required" }, { status: 400 });
    }

    try {
      await prisma.brands.update({
        where: { id: Number(id) },
        data: { brand_name, image, top, status, order_wise, updated_at: nowForDb() },
      });
    } catch {
      return NextResponse.json({ success: false, message: "Brand not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Brand updated successfully" });
  } catch (error) {
    console.error("UPDATE ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/brands:
 *   delete:
 *     summary: Delete a brand by ID query param (admin token)
 *     tags: [Brands]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Brand ID.
 *     responses:
 *       200:
 *         description: Brand deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Brand deleted successfully" }
 *       400:
 *         description: Missing brand ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Brand ID is required" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Brand not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Brand not found" }
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
export async function DELETE(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, message: "Brand ID is required" }, { status: 400 });
    }

    try {
      await prisma.brands.delete({ where: { id: Number(id) } });
    } catch {
      return NextResponse.json({ success: false, message: "Brand not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Brand deleted successfully" });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
