import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { formatCategoryRows } from "@/lib/categoryTree";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/v1/categories/[id]/route.js. This path doesn't exist in Laravel's
// mobile contract at all (admin-only), so every verb here is gated by requireAdminAuth (gargnew
// enforced no auth on any of these - a real gap, see the sibling route.ts's top comment).
/**
 * @swagger
 * /api/v1/categories/{id}:
 *   get:
 *     summary: Get a single category by ID (admin)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Category ID.
 *     responses:
 *       200:
 *         description: Category fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 category:
 *                   type: object
 *                   description: Raw categories row (lib/categoryTree.ts formatCategoryRows) plus image_full_url/image_url.
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Category not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Category not found" }
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
    const row = await prisma.categories.findUnique({ where: { id: BigInt(id) } });
    if (!row) {
      return NextResponse.json({ success: false, message: "Category not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, category: formatCategoryRows([row])[0] });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   put:
 *     summary: Update a category (admin token), optionally replacing/removing its image
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Category ID.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               category_name: { type: string }
 *               parent_id: { type: string, description: "Parent category ID; empty string/'null' means top-level." }
 *               top: { type: string, description: "0 or 1, defaults to 0." }
 *               status: { type: string, description: "0 or 1, defaults to 0." }
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: New category image. Saved under public/uploads (not the mediaStorage path used elsewhere).
 *               existing_image: { type: string, description: "Path to keep when no new image is uploaded." }
 *               remove_image: { type: string, description: "Set to \"1\" to clear the image." }
 *     responses:
 *       200:
 *         description: Category updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Category updated successfully" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Category not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Category not found" }
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

    const categoryName = String(formData.get("category_name") || "");
    const parentRaw = formData.get("parent_id");
    const parentId = parentRaw === "" || parentRaw === "null" || parentRaw === null ? null : Number(parentRaw);
    const top = Number(formData.get("top") || 0);
    const status = Number(formData.get("status") || 0);
    const image = formData.get("image");
    const existingImage = String(formData.get("existing_image") || "");
    const removeImage = formData.get("remove_image");

    let imagePath = existingImage;
    if (image && typeof image === "object" && (image as File).size > 0) {
      const buffer = Buffer.from(await (image as File).arrayBuffer());
      const fileName = `${Date.now()}-${(image as File).name}`;
      const uploadDir = path.join(process.cwd(), "public/uploads");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, fileName), buffer);
      imagePath = `/uploads/${fileName}`;
    }
    if (removeImage === "1") imagePath = "";

    const existing = await prisma.categories.findUnique({ where: { id: BigInt(id) } });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Category not found" }, { status: 404 });
    }

    await prisma.categories.update({
      where: { id: BigInt(id) },
      data: { category_name: categoryName, parent_id: parentId, image: imagePath, top, status, updated_at: nowForDb() },
    });

    return NextResponse.json({ success: true, message: "Category updated successfully" });
  } catch (error) {
    console.error("PUT ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   patch:
 *     summary: Partially update a category's top/status flags (admin token)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Category ID.
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
 *         description: Category updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Category updated successfully" }
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
 *         description: Category not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Category not found" }
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

    const existing = await prisma.categories.findUnique({ where: { id: BigInt(id) } });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Category not found" }, { status: 404 });
    }

    await prisma.categories.update({ where: { id: BigInt(id) }, data });
    return NextResponse.json({ success: true, message: "Category updated successfully" });
  } catch (error) {
    console.error("PATCH /api/v1/categories/[id] error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   delete:
 *     summary: Delete a category (admin token)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Category ID.
 *     responses:
 *       200:
 *         description: Category deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Category deleted successfully" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Category not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Category not found" }
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
    try {
      await prisma.categories.delete({ where: { id: BigInt(id) } });
    } catch {
      return NextResponse.json({ success: false, message: "Category not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
