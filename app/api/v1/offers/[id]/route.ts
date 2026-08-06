import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/v1/offers/[id]/route.js. Admin-only path, gated on every verb.
/**
 * @swagger
 * /api/v1/offers/{id}:
 *   get:
 *     summary: Get a single offer by ID (admin)
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Offer ID.
 *     responses:
 *       200:
 *         description: Offer fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 offer:
 *                   type: object
 *                   description: Raw offers row plus offer_image_full_url.
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Offer not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Offer not found" }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { id } = await params;
  const row = await prisma.offers.findUnique({ where: { id: Number(id) } });
  if (!row) return NextResponse.json({ success: false, message: "Offer not found" }, { status: 404 });
  return NextResponse.json({ success: true, offer: { ...row, offer_image_full_url: assetUrl(row.offer_image, "backend/offer_images") } });
}

/**
 * @swagger
 * /api/v1/offers/{id}:
 *   put:
 *     summary: Update an offer (admin token), optionally replacing its image
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Offer ID.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, description: "Falls back to the existing title when omitted." }
 *               start_date: { type: string, format: date, nullable: true }
 *               end_date: { type: string, format: date, nullable: true }
 *               is_active: { type: string, description: "0 or 1; falls back to the existing value when omitted." }
 *               offer_image:
 *                 type: string
 *                 format: binary
 *                 description: New offer image. When omitted, the existing image is kept.
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               start_date: { type: string, format: date, nullable: true }
 *               end_date: { type: string, format: date, nullable: true }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Offer updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Offer updated successfully" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Offer not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Offer not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Internal server error." }
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.offers.findUnique({ where: { id: Number(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Offer not found" }, { status: 404 });

    const contentType = req.headers.get("content-type") || "";
    let title: string, start_date: string | null, end_date: string | null, is_active: unknown;
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      title = String(formData.get("title") || existing.title);
      start_date = (formData.get("start_date") as string) || null;
      end_date = (formData.get("end_date") as string) || null;
      is_active = formData.get("is_active");
      file = formData.get("offer_image") as File | null;
    } else {
      const body = await req.json();
      title = body.title ?? existing.title;
      start_date = body.start_date || null;
      end_date = body.end_date || null;
      is_active = body.is_active;
    }

    let offer_image = existing.offer_image;
    if (file && file.size > 0) {
      const dir = path.join(mediaStoragePath(), "backend/offer_images");
      await mkdir(dir, { recursive: true });
      const safeName = `${Date.now()}-${String(file.name || "offer.jpg").replace(/\s+/g, "_")}`;
      await writeFile(path.join(dir, safeName), Buffer.from(await file.arrayBuffer()));
      offer_image = safeName;
    }

    await prisma.offers.update({
      where: { id: Number(id) },
      data: {
        title,
        offer_image,
        start_date: start_date ? new Date(start_date) : existing.start_date,
        end_date: end_date ? new Date(end_date) : existing.end_date,
        is_active: is_active === undefined ? existing.is_active : Boolean(Number(is_active)),
        updated_at: nowForDb(),
      },
    });

    await recordAuditLog({
      adminId: authUser.id,
      action: "Update",
      module: "offers",
      modelType: "Offer",
      modelId: id,
      newData: { title, is_active },
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "Offer updated successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/offers/{id}:
 *   patch:
 *     summary: Toggle an offer's active status (admin token)
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Offer ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [is_active]
 *             properties:
 *               is_active: { type: string, description: "Coerced via Boolean(Number(is_active)) - e.g. \"0\"/\"1\"." }
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
 *       404:
 *         description: Offer not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Offer not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Internal server error." }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { is_active } = await req.json();

    try {
      await prisma.offers.update({ where: { id: Number(id) }, data: { is_active: Boolean(Number(is_active)), updated_at: nowForDb() } });
    } catch {
      return NextResponse.json({ success: false, message: "Offer not found" }, { status: 404 });
    }

    await recordAuditLog({
      adminId: authUser.id,
      action: "Update",
      module: "offers",
      modelType: "Offer",
      modelId: id,
      newData: { is_active },
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "Status updated" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/offers/{id}:
 *   delete:
 *     summary: Delete an offer (admin token)
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Offer ID.
 *     responses:
 *       200:
 *         description: Offer deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Offer deleted successfully" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Offer not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Offer not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Internal server error." }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    try {
      await prisma.offers.delete({ where: { id: Number(id) } });
    } catch {
      return NextResponse.json({ success: false, message: "Offer not found" }, { status: 404 });
    }

    await recordAuditLog({
      adminId: authUser.id,
      action: "Delete",
      module: "offers",
      modelType: "Offer",
      modelId: id,
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "Offer deleted successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
