import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { deleteAdminRole, fetchAdminRoleById, saveAdminRole } from "@/lib/adminUsersDb";

// Ports gargnew's app/api/system-users/groups/[id]/route.js.
/**
 * @swagger
 * /api/system-users/groups/{id}:
 *   get:
 *     summary: Get a single user group/role by id (admin token)
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Group fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 group:
 *                   type: object
 *                   description: Admin role/group (id, groupName, permissions, status, createdAt, updatedAt).
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Group not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Group not found." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const group = await fetchAdminRoleById(Number(id));
    if (!group) {
      return NextResponse.json({ success: false, message: "Group not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, group });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}

/**
 * @swagger
 * /api/system-users/groups/{id}:
 *   put:
 *     summary: Update a user group/role (admin token)
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [groupName]
 *             properties:
 *               groupName: { type: string, description: "Aliases: group_name, name." }
 *               permissions:
 *                 description: Stored as JSON if an array is sent, otherwise as a plain string.
 *                 oneOf:
 *                   - type: array
 *                     items: { type: string }
 *                   - type: string
 *               status: { type: string, description: "\"inactive\" or 0 sets inactive; anything else sets active." }
 *     responses:
 *       200:
 *         description: Group updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Group updated successfully." }
 *                 group: { type: object, description: Same shape as GET's group object. }
 *       400:
 *         description: Missing group name.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const result = await saveAdminRole({ id: Number(id), body });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status || 400 });
    }

    await recordAuditLog({
      adminId: authUser.id,
      action: "Update",
      module: "admin_roles",
      modelType: "AdminRole",
      modelId: id,
      newData: body,
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    });

    const group = await fetchAdminRoleById(Number(id));
    return NextResponse.json({ success: true, message: "Group updated successfully.", group });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}

/**
 * @swagger
 * /api/system-users/groups/{id}:
 *   delete:
 *     summary: Delete a user group/role (admin token)
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Group deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Group deleted successfully." }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Group not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Group not found." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deleted = await deleteAdminRole(Number(id));
    if (!deleted) {
      return NextResponse.json({ success: false, message: "Group not found." }, { status: 404 });
    }

    await recordAuditLog({
      adminId: authUser.id,
      action: "Delete",
      module: "admin_roles",
      modelType: "AdminRole",
      modelId: id,
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "Group deleted successfully." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error." },
      { status: 500 },
    );
  }
}
