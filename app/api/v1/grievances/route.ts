import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/grievances/route.js GET (admin list). Net-new admin path — the
// customer-facing submit endpoint lives at /api/v1/customer/grievance. gargnew's own table had
// legacy documents/status columns that don't exist on this project's real `grievances` table
// (id, customer_id, full_name, email, phone, city, remarks, document, created_at, updated_at).
/**
 * @swagger
 * /api/v1/grievances:
 *   get:
 *     summary: List all submitted grievances (admin panel)
 *     tags: [Grievances]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Grievances fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 grievances:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw grievances row (id, customer_id, full_name, email, phone, city, remarks, document, created_at, updated_at).
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
 *                 message: { type: string, example: "Internal server error. Please try again." }
 */
export async function GET(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const grievances = await prisma.grievances.findMany({ orderBy: { id: "desc" } });
    return NextResponse.json({ success: true, grievances });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error. Please try again." }, { status: 500 });
  }
}
