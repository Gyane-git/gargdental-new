import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { serializeCategoryWithActiveChildren, shouldReturnFlatCategories, formatCategoryRows } from "@/lib/categoryTree";
import { requireAdminAuth } from "@/lib/adminAuth";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports CategoryController::get_categories (CategoryController.php:31-50) for the mobile app,
// PLUS gargnew's admin-mode branch on this SAME endpoint (app/api/v1/categories/route.js) -
// the admin categories page calls this exact URL and gets a flat, all-categories array back
// via ?flat=1 or its own Referer header, instead of the Laravel-compatible active-only tree.
/**
 * @swagger
 * /api/v1/categories:
 *   get:
 *     summary: List active top-level categories with their active children as a tree (mobile-compatible shape), or ALL categories as a flat array when requested from the admin UI
 *     tags: [Categories]
 *     parameters:
 *       - in: query
 *         name: flat
 *         schema:
 *           type: string
 *         required: false
 *         description: Set to "1" to force the flat, all-categories admin shape (also triggered automatically by an /admin Referer).
 *     responses:
 *       200:
 *         description: >
 *           Default (mobile) shape is `{success, message, categories}` - active top-level categories, each with
 *           an `activeChildren` array of active sub-categories. Flat/admin shape is `{success, categories}` - every
 *           category row regardless of status, ordered by id, with no tree nesting.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Categories fetched successfully." }
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw categories row plus image_full_url/image_url, and activeChildren (tree mode only).
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(req: NextRequest) {
  try {
    if (shouldReturnFlatCategories(req)) {
      const rows = await prisma.categories.findMany({ orderBy: { id: "asc" } });
      return NextResponse.json({ success: true, categories: formatCategoryRows(rows) });
    }

    const topLevel = await prisma.categories.findMany({ where: { status: 1, parent_id: null } });
    const categories = await Promise.all(topLevel.map((c) => serializeCategoryWithActiveChildren(c.id)));
    return successResponse("Categories fetched successfully.", { categories });
  } catch (error) {
    console.error("Exception occurred while fetching categories", error);
    return serverErrorResponse("Failed to get categories", error);
  }
}

// Ports gargnew's admin category-create (app/api/v1/categories/route.js POST). Note: gargnew
// enforces NO auth at all on this write endpoint (a real gap - anyone who found the URL could
// modify the live catalog) - added requireAdminAuth() here since the mobile app never calls
// POST on this path, so this can only ever affect the admin-only write surface.
/**
 * @swagger
 * /api/v1/categories:
 *   post:
 *     summary: Create a category (admin token)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, description: "Category name. `category_name` is also accepted as a fallback key." }
 *               parentCategory: { type: string, description: "Parent category ID; empty/'null' means top-level. `parent_id` is also accepted as a fallback key." }
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Category image. Saved under public/uploads. New categories are always created active (status=1) and not top (top=0).
 *     responses:
 *       200:
 *         description: Category created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Category created successfully" }
 *       400:
 *         description: Missing category name.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Category name is required" }
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
    const name = String(formData.get("name") || formData.get("category_name") || "");
    const parentRaw = formData.get("parentCategory") || formData.get("parent_id");
    const image = formData.get("image");

    if (!name) {
      return NextResponse.json({ success: false, message: "Category name is required" }, { status: 400 });
    }

    let imagePath = "";
    if (image && typeof image === "object" && (image as File).size > 0) {
      const buffer = Buffer.from(await (image as File).arrayBuffer());
      const fileName = `${Date.now()}-${(image as File).name}`;
      const uploadDir = path.join(process.cwd(), "public/uploads");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, fileName), buffer);
      imagePath = `/uploads/${fileName}`;
    }

    const parentIdValue = parentRaw === "" || parentRaw === "null" || parentRaw === null ? null : Number(parentRaw);

    await prisma.categories.create({
      data: {
        category_name: name,
        parent_id: parentIdValue,
        image: imagePath,
        status: 1,
        top: 0,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    return NextResponse.json({ success: true, message: "Category created successfully" });
  } catch (error) {
    console.error("ADD CATEGORY ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
