import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { assetUrl } from "@/lib/assetUrl";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/v1/brands/[id]/route.js. Admin-only path (not in Laravel's mobile
// contract), gated by requireAdminAuth on every verb.
/**
 * @swagger
 * /api/v1/brands/{id}:
 *   get:
 *     summary: Get a single brand by ID (admin)
 *     tags: [Brands]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Brand ID.
 *     responses:
 *       200:
 *         description: Brand fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 brand:
 *                   type: object
 *                   description: Raw brands row.
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
 *                 message: { type: string, example: "Not found" }
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
    const row = await prisma.brands.findUnique({ where: { id: Number(id) } });
    if (!row) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    const brand = { ...row, image_full_url: assetUrl(row.image, "backend/brands") };
    return NextResponse.json({ success: true, brand });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/brands/{id}:
 *   put:
 *     summary: Update a brand (admin token), optionally replacing its logo
 *     tags: [Brands]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Brand ID.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               brand_name: { type: string }
 *               setTopBrand: { type: string, description: "0 or 1; defaults to 0 when omitted." }
 *               publish: { type: string, description: "0 or 1; defaults to 1 when omitted." }
 *               order_wise: { type: string, description: "Sort order; null when omitted/empty." }
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: New logo file. When omitted, the existing logo is kept.
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               brand_name: { type: string }
 *               setTopBrand: { type: integer }
 *               publish: { type: integer }
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
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const contentType = req.headers.get("content-type") || "";

    let brand_name: string | undefined, setTopBrand: unknown, publish: unknown, order_wise: unknown;
    let newLogoPath: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      brand_name = String(formData.get("brand_name") || "");
      setTopBrand = formData.get("setTopBrand");
      publish = formData.get("publish");
      order_wise = formData.get("order_wise");

      const logoFile = formData.get("logo");
      if (logoFile && typeof logoFile === "object" && (logoFile as File).size > 0) {
        const buffer = Buffer.from(await (logoFile as File).arrayBuffer());
        const filename = `brand_${Date.now()}_${(logoFile as File).name}`;
        const dir = path.join(mediaStoragePath(), "backend/brands");
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, filename), buffer);
        newLogoPath = filename;
      }
    } else {
      const body = await req.json();
      brand_name = body.brand_name;
      setTopBrand = body.setTopBrand;
      publish = body.publish;
      order_wise = body.order_wise;
    }

    const current = await prisma.brands.findUnique({ where: { id: Number(id) } });
    if (!current) {
      return NextResponse.json({ success: false, message: "Brand not found" }, { status: 404 });
    }

    const finalLogo = newLogoPath ?? current.image;

    await prisma.brands.update({
      where: { id: Number(id) },
      data: {
        brand_name,
        image: finalLogo,
        top: setTopBrand !== undefined ? Number(setTopBrand) : 0,
        status: publish !== undefined ? Number(publish) : 1,
        order_wise: order_wise ? Number(order_wise) : null,
        updated_at: nowForDb(),
      },
    });

    return NextResponse.json({ success: true, message: "Brand updated successfully" });
  } catch (error) {
    console.error("PUT brand error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/brands/{id}:
 *   patch:
 *     summary: Partially update a brand's top/status flags (admin token)
 *     tags: [Brands]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Brand ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: At least one of `top` or `status` must be provided, each 0 or 1.
 *             properties:
 *               top: { type: integer, enum: [0, 1] }
 *               status: { type: integer, enum: [0, 1] }
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
 *         description: Invalid or missing top/status value.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "No valid fields provided. Send top or status." }
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
 *                 message: { type: string, example: "Internal server error" }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, number> = {};

    for (const field of ["top", "status"] as const) {
      if (body[field] !== undefined) {
        if (body[field] !== 0 && body[field] !== 1) {
          return NextResponse.json({ success: false, message: `Invalid value for "${field}". Must be 0 or 1.` }, { status: 400 });
        }
        data[field] = body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, message: "No valid fields provided. Send top or status." }, { status: 400 });
    }

    try {
      await prisma.brands.update({ where: { id: Number(id) }, data });
    } catch {
      return NextResponse.json({ success: false, message: "Brand not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Brand updated successfully" });
  } catch (error) {
    console.error("PATCH /api/v1/brands/[id] error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/brands/{id}:
 *   delete:
 *     summary: Delete a brand (admin token)
 *     tags: [Brands]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Brand ID.
 *     responses:
 *       200:
 *         description: Brand deleted successfully. Also returned when the ID doesn't exist (the delete failure is swallowed).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Brand deleted successfully" }
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
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await prisma.brands.delete({ where: { id: Number(id) } }).catch(() => null);
    return NextResponse.json({ success: true, message: "Brand deleted successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
