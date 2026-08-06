import { prisma } from "@/lib/prisma";
import { nowForDb } from "@/lib/dbTime";

function ymd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

// Ports Helpers::generateReturnId (Helpers.php:378-385).
export async function generateReturnId(): Promise<string> {
  const prefix = String(10 + Math.floor(Math.random() * 90));
  const today = nowForDb();
  const timestamp = ymd(today);

  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0));
  const dayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

  const latestReturn = await prisma.order_returns.findFirst({
    where: { created_at: { gte: dayStart, lte: dayEnd } },
    orderBy: { id: "desc" },
  });

  // Laravel reads substr($latestReturn->order_id, -4) here (order_id, not return_id - likely a
  // copy-paste artifact from generateOrderId, replicated as-is).
  const lastNumber = latestReturn ? parseInt(String(latestReturn.order_id).slice(-4), 10) || 0 : 0;
  const seq = String(lastNumber + 1).padStart(4, "0");
  return `${prefix}${timestamp}${seq}`;
}
