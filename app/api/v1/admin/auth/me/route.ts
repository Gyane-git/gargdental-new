import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth, findAdminWithRole } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/admin/auth/me/route.js. This is what app/admin/layout.tsx calls on
// every navigation to re-validate the session against the DB (not just trusting JWT claims).
/**
 * @swagger
 * /api/v1/admin/auth/me:
 *   get:
 *     summary: Get the current admin's profile (admin token), re-validated against the database
 *     tags: [AdminAuth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current admin profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 admin:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     full_name: { type: string }
 *                     email: { type: string }
 *                     phone: { type: string, nullable: true }
 *                     profile_photo_path: { type: string, nullable: true }
 *                     role: { type: string }
 *                     role_id: { type: integer }
 *                     permissions: { type: string, description: "JSON-encoded array of permission strings" }
 *       401:
 *         description: Missing/invalid admin token, or the admin no longer exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 */
export async function GET(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser?.id) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const result = await findAdminWithRole(authUser.id);
  if (!result) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { admin, role } = result;
  const roleName = role?.name || admin.account_type || "Staff";

  return NextResponse.json({
    success: true,
    admin: {
      id: admin.id,
      full_name: admin.name,
      email: admin.email,
      phone: admin.phone,
      profile_photo_path: admin.profile_photo_path,
      role: roleName,
      role_id: admin.role_id,
      permissions: role?.modules || "",
    },
  });
}
