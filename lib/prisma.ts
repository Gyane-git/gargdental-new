import { PrismaClient, Prisma } from "@prisma/client";
import { KATHMANDU_OFFSET_MS } from "./dbTime";

// Prisma maps SQL BIGINT columns (most `id` PKs in this schema) to JS BigInt, which
// NextResponse.json()/JSON.stringify can't serialize natively. Laravel/Eloquent returns these
// as plain JSON integers, so we mirror that by coercing BigInt -> Number at serialization time
// (safe here: these are auto-increment IDs/counts, never near Number.MAX_SAFE_INTEGER).
declare global {
  interface BigInt {
    toJSON(): number;
  }
}
BigInt.prototype.toJSON = function (this: bigint) {
  return Number(this);
};

// Every DECIMAL column in this schema is scale=2 (confirmed via schema.prisma grep - Decimal(10,2),
// (12,2), (24,2), (15,2), (8,2), all scale 2). Laravel/Eloquent's decimal cast always serializes
// with the column's fixed scale (e.g. "1100.00"), but Prisma's Decimal (decimal.js) default
// toJSON()/toString() strips trailing zeros (e.g. "1100") - confirmed by diffing a live product's
// sell_price against gargdental. Patch toJSON to always emit 2 decimal places to match exactly.
Prisma.Decimal.prototype.toJSON = function (this: InstanceType<typeof Prisma.Decimal>) {
  return this.toFixed(2);
};

// See lib/dbTime.ts: Prisma reads DATETIME columns as literal-UTC, but the stored digits are
// actually Kathmandu wall-clock (Laravel's APP_TIMEZONE). Laravel itself converts back to true
// UTC when serializing to JSON - so we must too, uniformly, for every Date that flows through
// a JSON response (in this app, that's exclusively Prisma DateTime fields plus values written
// via nowForDb(), both of which this offset correctly reverses).
Date.prototype.toJSON = function (this: Date) {
  return new Date(this.getTime() - KATHMANDU_OFFSET_MS).toISOString();
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = prisma;
