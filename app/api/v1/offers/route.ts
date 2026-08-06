import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports OfferController::get_offers (OfferController.php:34-54) for the mobile app, PLUS
// gargnew's admin filters on this SAME endpoint (include_inactive, limit) - the admin GET
// already matches the Laravel {success,message,offers} shape, so this is a superset. The
// 15s in-memory response cache gargnew has is skipped here (a minor perf optimization, not
// behavior) - every request just queries directly.
/**
 * @swagger
 * /api/v1/offers:
 *   get:
 *     summary: List active offers (mobile-compatible shape), with optional admin filters
 *     tags: [Offers]
 *     parameters:
 *       - in: query
 *         name: include_inactive
 *         schema:
 *           type: string
 *         required: false
 *         description: Set to "1" to include inactive offers too (admin use).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         required: false
 *         description: Max rows to return. Omit or non-positive for no limit.
 *     responses:
 *       200:
 *         description: Offers fetched successfully, newest first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Offers fetched successfully." }
 *                 offers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw offers row plus offer_image_full_url.
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
    const limit = searchParams.get("limit");

    const rows = await prisma.offers.findMany({
      where: includeInactive ? {} : { is_active: true },
      orderBy: { id: "desc" },
      ...(limit && Number(limit) > 0 ? { take: Number(limit) } : {}),
    });

    const offers = rows.map((row) => ({ ...row, offer_image_full_url: assetUrl(row.offer_image, "backend/offer_images") }));
    return successResponse("Offers fetched successfully.", { offers });
  } catch (error) {
    console.error("Exception occurred while fetching offers", error);
    return serverErrorResponse("Failed to fetch offers", error);
  }
}

// Ports gargnew's admin offer-create (app/api/v1/offers/route.js POST). requireAdminAuth added
// (gargnew's own auth check here was optional/best-effort, not enforced).
/**
 * @swagger
 * /api/v1/offers:
 *   post:
 *     summary: Create an offer (admin token)
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               start_date: { type: string, format: date, nullable: true }
 *               end_date: { type: string, format: date, nullable: true }
 *               is_active: { type: string, description: "0 or 1; defaults to true (active) when omitted." }
 *               offer_image:
 *                 type: string
 *                 format: binary
 *                 description: Offer image.
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               start_date: { type: string, format: date, nullable: true }
 *               end_date: { type: string, format: date, nullable: true }
 *               is_active: { type: boolean }
 *     responses:
 *       201:
 *         description: Offer saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Offer saved successfully." }
 *                 id: { type: integer, example: 12 }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       422:
 *         description: Missing/blank title.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Title is required." }
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
export async function POST(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let title: string, start_date: string | null, end_date: string | null, is_active: unknown;
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      title = String(formData.get("title") || "");
      start_date = (formData.get("start_date") as string) || null;
      end_date = (formData.get("end_date") as string) || null;
      is_active = formData.get("is_active");
      file = formData.get("offer_image") as File | null;
    } else {
      const body = await req.json();
      title = body.title;
      start_date = body.start_date || null;
      end_date = body.end_date || null;
      is_active = body.is_active;
    }

    if (!String(title || "").trim()) {
      return NextResponse.json({ success: false, message: "Title is required." }, { status: 422 });
    }

    let offer_image: string | null = null;
    if (file && file.size > 0) {
      const dir = path.join(mediaStoragePath(), "backend/offer_images");
      await mkdir(dir, { recursive: true });
      const safeName = `${Date.now()}-${String(file.name || "offer.jpg").replace(/\s+/g, "_")}`;
      await writeFile(path.join(dir, safeName), Buffer.from(await file.arrayBuffer()));
      offer_image = safeName;
    }

    const created = await prisma.offers.create({
      data: {
        title: String(title),
        offer_image,
        start_date: start_date ? new Date(start_date) : null,
        end_date: end_date ? new Date(end_date) : null,
        is_active: is_active === undefined ? true : Boolean(Number(is_active)),
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    await recordAuditLog({
      adminId: authUser.id,
      action: "Create",
      module: "offers",
      modelType: "Offer",
      modelId: String(created.id),
      newData: { title, is_active },
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "Offer saved successfully.", id: created.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
