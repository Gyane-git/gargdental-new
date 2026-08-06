import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/clinic/clinic-setup/requests/route.js (admin listing over the real
// clinic_setup_requests table /api/v1/clinic/clinic-setup/store writes to). requireAdminAuth
// added - gargnew left this unauthenticated.
/**
 * @swagger
 * /api/v1/clinic/clinic-setup/requests:
 *   get:
 *     summary: List all clinic-setup requests (admin panel)
 *     tags: [Clinic]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Requests fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 requests:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: clinic_setup_requests row (id, full_name, email, phone, city, budget, remarks, created_at, updated_at).
 *       401:
 *         description: Missing/invalid admin bearer token.
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
 *                 message: { type: string, example: "Internal server error." }
 */
export async function GET(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const requests = await prisma.clinic_setup_requests.findMany({ orderBy: { id: "desc" } });
    return NextResponse.json({ success: true, requests });
  } catch (error) {
    console.error("CLINIC SETUP REQUESTS ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
