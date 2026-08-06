import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Net-new admin reporting endpoint. gargnew's own app/admin/CIPS-transaction-report/page.js
// calls this exact path (`/api/report/cips-transactions`) but the route was never built there
// either (page.js has hardcoded "Sample data — remove when API is connected"); this is a real
// implementation over the actual connectips_transactions table (joined to orders -> users for
// customerName, via connectips_transactions.reference_id = orders.transaction_id).
/**
 * @swagger
 * /api/report/cips-transactions:
 *   get:
 *     summary: List ConnectIPS transactions with customer names, paginated (admin token)
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         required: false
 *         description: Defaults to 1.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         required: false
 *         description: Defaults to 10.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *         description: Matches against reference_id, status or status_desc.
 *     responses:
 *       200:
 *         description: Transactions fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Transaction row (id, transactionId, customerName, totalAmount, statusDescription, status, transactionDate).
 *                 total: { type: integer, description: Total matching rows (ignoring pagination). }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 totalPages: { type: integer }
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
export async function GET(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = (searchParams.get("search") || "").trim();

    const where = search
      ? { OR: [{ reference_id: { contains: search } }, { status: { contains: search } }, { status_desc: { contains: search } }] }
      : {};

    const total = await prisma.connectips_transactions.count({ where });
    const rows = await prisma.connectips_transactions.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const orders = await prisma.orders.findMany({
      where: { transaction_id: { in: rows.map((r) => r.reference_id) } },
    });
    const orderByTxnId = new Map(orders.map((o) => [o.transaction_id, o]));

    const customerIds = orders.map((o) => o.customer_id);
    const customers = customerIds.length ? await prisma.users.findMany({ where: { id: { in: customerIds } } }) : [];
    const customerById = new Map(customers.map((c) => [c.id.toString(), c.full_name]));

    const transactions = rows.map((row) => {
      const order = orderByTxnId.get(row.reference_id);
      const customerName = order ? customerById.get(order.customer_id.toString()) || null : null;

      return {
        id: row.id,
        transactionId: row.reference_id,
        customerName,
        totalAmount: Number(row.txn_amt) / 100,
        statusDescription: row.status_desc,
        status: row.status,
        transactionDate: row.created_at,
      };
    });

    return NextResponse.json({ success: true, transactions, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("[GET /api/report/cips-transactions]", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to fetch transactions." }, { status: 500 });
  }
}
