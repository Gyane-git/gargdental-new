import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { requireAdminAuth } from "@/lib/adminAuth";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/v1/banners/[id]/route.js. Admin-only path, gated on every verb.
/**
 * @swagger
 * /api/v1/banners/{id}:
 *   get:
 *     summary: Get a single banner (carousel image) by ID (admin)
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Banner ID.
 *     responses:
 *       200:
 *         description: Banner fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 banner:
 *                   type: object
 *                   description: Raw carousel_images row.
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Banner not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Not found" }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }
  const { id } = await params;
  const row = await prisma.carousel_images.findUnique({ where: { id: BigInt(id) } });
  if (!row) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  const banner = {
    ...row,
    image_full_url: assetUrl(row.file_path, "backend/carousel_files"),
    mobile_image_full_url: assetUrl(row.mobile_file_path, "backend/carousel_files"),
  };
  return NextResponse.json({ success: true, banner });
}

/**
 * @swagger
 * /api/v1/banners/{id}:
 *   put:
 *     summary: Update a banner (admin token), optionally replacing/removing its desktop and mobile images
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Banner ID.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               product_code: { type: string, description: "Linked product code (optional)." }
 *               is_offer: { type: string, description: "0 or 1, defaults to 0." }
 *               status: { type: string, description: "0 or 1, defaults to 1." }
 *               remove_desktop: { type: string, description: "\"true\" to clear the desktop image." }
 *               remove_mobile: { type: string, description: "\"true\" to clear the mobile image." }
 *               desktop_image:
 *                 type: string
 *                 format: binary
 *                 description: New desktop banner image.
 *               mobile_image:
 *                 type: string
 *                 format: binary
 *                 description: New mobile banner image.
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               product_code: { type: string }
 *               is_offer: { type: integer }
 *               status: { type: integer }
 *     responses:
 *       200:
 *         description: Updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Updated successfully" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Banner not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Banner not found" }
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

    let product_code: string | undefined, is_offer: unknown, status: unknown;
    let newDesktopPath: string | null = null;
    let newMobilePath: string | null = null;
    let removeDesktop = false;
    let removeMobile = false;

    const dir = path.join(mediaStoragePath(), "backend/carousel_files");

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      product_code = String(formData.get("product_code") || "");
      is_offer = formData.get("is_offer");
      status = formData.get("status");
      removeDesktop = formData.get("remove_desktop") === "true";
      removeMobile = formData.get("remove_mobile") === "true";

      const desktopFile = formData.get("desktop_image");
      const mobileFile = formData.get("mobile_image");

      if (desktopFile instanceof File && desktopFile.size > 0) {
        await mkdir(dir, { recursive: true });
        const filename = `desktop_${Date.now()}_${desktopFile.name}`;
        await writeFile(path.join(dir, filename), Buffer.from(await desktopFile.arrayBuffer()));
        newDesktopPath = filename;
      }
      if (mobileFile instanceof File && mobileFile.size > 0) {
        await mkdir(dir, { recursive: true });
        const filename = `mobile_${Date.now()}_${mobileFile.name}`;
        await writeFile(path.join(dir, filename), Buffer.from(await mobileFile.arrayBuffer()));
        newMobilePath = filename;
      }
    } else {
      const body = await req.json();
      product_code = body.product_code;
      is_offer = body.is_offer;
      status = body.status;
    }

    const current = await prisma.carousel_images.findUnique({ where: { id: BigInt(id) } });
    if (!current) {
      return NextResponse.json({ success: false, message: "Banner not found" }, { status: 404 });
    }

    let finalDesktopPath = current.file_path;
    let finalMobilePath = current.mobile_file_path;
    if (removeDesktop) finalDesktopPath = null;
    if (removeMobile) finalMobilePath = null;
    if (newDesktopPath) finalDesktopPath = newDesktopPath;
    if (newMobilePath) finalMobilePath = newMobilePath;

    await prisma.carousel_images.update({
      where: { id: BigInt(id) },
      data: {
        product_code,
        file_path: finalDesktopPath,
        mobile_file_path: finalMobilePath,
        is_offer: Number(is_offer ?? 0),
        status: Number(status ?? 1),
        updated_at: nowForDb(),
      },
    });

    return NextResponse.json({ success: true, message: "Updated successfully" });
  } catch (error) {
    console.error("PUT error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/banners/{id}:
 *   patch:
 *     summary: Update a banner's status flag (admin token)
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Banner ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: Status updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Status updated" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error (also raised when the banner ID doesn't exist, since the update isn't separately checked for existence).
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
    const { status } = await req.json();
    await prisma.carousel_images.update({ where: { id: BigInt(id) }, data: { status: Number(status), updated_at: nowForDb() } });
    return NextResponse.json({ success: true, message: "Status updated" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/banners/{id}:
 *   delete:
 *     summary: Delete a banner (admin token)
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Banner ID.
 *     responses:
 *       200:
 *         description: Deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Deleted successfully" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error (also raised when the banner ID doesn't exist).
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
    await prisma.carousel_images.delete({ where: { id: BigInt(id) } });
    return NextResponse.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
