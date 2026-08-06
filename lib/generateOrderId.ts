import { prisma } from "@/lib/prisma";
import { nowForDb } from "@/lib/dbTime";

function ymd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

// Ports Helpers::generateOrderId (Helpers.php:369-376). Not transaction-safe in Laravel either
// (a real race condition under concurrent orders on the same day) - replicated as-is, not fixed.
export async function generateOrderId(): Promise<string> {
  const prefix = String(1000 + Math.floor(Math.random() * 9000));
  const today = nowForDb();
  const timestamp = ymd(today);

  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0));
  const dayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

  const latestOrder = await prisma.orders.findFirst({
    where: { created_at: { gte: dayStart, lte: dayEnd } },
    orderBy: { id: "desc" },
  });

  const lastNumber = latestOrder ? parseInt(String(latestOrder.order_id).slice(-4), 10) || 0 : 0;
  const seq = String(lastNumber + 1).padStart(4, "0");
  return `${prefix}${timestamp}${seq}`;
}
