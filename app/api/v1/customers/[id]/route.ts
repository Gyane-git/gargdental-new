import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/v1/customers/[id]/route.js. requireAdminAuth added (gargnew left
// this unauthenticated). Uses the real `full_name` column (gargnew's own PUT/DELETE referenced
// a `name` column that doesn't exist on this project's `users` table).
/**
 * @swagger
 * /api/v1/customers/{id}:
 *   get:
 *     summary: Get a single customer by id (admin panel)
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: users.id
 *     responses:
 *       200:
 *         description: Customer fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 customer:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     full_name: { type: string }
 *                     email: { type: string }
 *                     phone: { type: string, nullable: true }
 *                     gender: { type: string, nullable: true }
 *                     status: { type: boolean }
 *                     created_at: { type: string, format: date-time }
 *                     updated_at: { type: string, format: date-time }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No customer with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Customer not found" }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { id } = await params;
  const customer = await prisma.users.findUnique({
    where: { id: BigInt(id) },
    select: { id: true, full_name: true, email: true, phone: true, gender: true, status: true, created_at: true, updated_at: true },
  });
  if (!customer) return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
  return NextResponse.json({ success: true, customer });
}

/**
 * @swagger
 * /api/v1/customers/{id}:
 *   put:
 *     summary: Update a customer's account fields (admin panel)
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: users.id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: All fields optional; only provided keys are updated. At least one must be present.
 *             properties:
 *               name: { type: string, description: "Stored as users.full_name." }
 *               email: { type: string }
 *               phone: { type: string }
 *               password: { type: string, description: "Hashed with bcrypt before storing." }
 *               status: { type: integer, description: "0 or 1, coerced to boolean." }
 *     responses:
 *       200:
 *         description: Customer updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Customer updated successfully" }
 *       400:
 *         description: No fields were provided to update.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "No fields provided to update" }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No customer with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Customer not found" }
 *       409:
 *         description: The email is already in use by another customer.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Email already in use by another customer" }
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
    const body = await req.json();
    const { name, email, phone, password, status } = body;

    const existing = await prisma.users.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });

    if (email !== undefined) {
      const emailCheck = await prisma.users.findFirst({ where: { email, NOT: { id: BigInt(id) } } });
      if (emailCheck) {
        return NextResponse.json({ success: false, message: "Email already in use by another customer" }, { status: 409 });
      }
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.full_name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (password !== undefined) data.password = await bcrypt.hash(password, 10);
    if (status !== undefined) data.status = Boolean(Number(status));

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, message: "No fields provided to update" }, { status: 400 });
    }

    data.updated_at = nowForDb();
    await prisma.users.update({ where: { id: BigInt(id) }, data });

    return NextResponse.json({ success: true, message: "Customer updated successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/customers/{id}:
 *   delete:
 *     summary: Delete a customer account (admin panel)
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: users.id
 *     responses:
 *       200:
 *         description: Customer deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Customer deleted successfully" }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No customer with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Customer not found" }
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
    const existing = await prisma.users.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });

    await prisma.users.delete({ where: { id: BigInt(id) } });

    return NextResponse.json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
