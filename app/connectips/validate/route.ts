import { NextResponse } from "next/server";
import { generateIpsToken } from "@/lib/connectIpsToken";
import { validateIpsTransaction } from "@/lib/connectIpsService";

export const runtime = "nodejs";

const MERCHANTID = process.env.CONNECT_IPS_MERCHANT_ID || process.env.NEXT_PUBLIC_CONNECTIPS_MERCHANTID || "";
const APPID = process.env.CONNECT_IPS_APP_ID || process.env.NEXT_PUBLIC_CONNECTIPS_APPID || "";

const normalizeReferenceId = (body: Record<string, unknown>) =>
  String(body.REFERENCEID ?? body.referenceId ?? body.reference_id ?? "");

const normalizeAmount = (body: Record<string, unknown>) =>
  Number(body.TXNAMT ?? body.txnAmt ?? body.txn_amt ?? body.amount ?? 0);

// Ports gargnew's app/connectips/validate/route.ts, rewritten against lib/connectIpsService.ts
// (see get_token/route.ts's comment for why - same `pem` package avoidance). This is a client-
// callable convenience wrapper; /api/v1/payment/ips/validate (the mobile-compatible endpoint,
// already built and verified) additionally persists the connectips_transactions row and updates
// order payment_status, so the storefront checkout flow should prefer that endpoint where it can.
export async function POST(request: Request) {
  try {
    if (!MERCHANTID || !APPID) {
      return NextResponse.json(
        { success: false, status: "ERROR", statusDesc: "ConnectIPS validation configuration is missing." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const referenceId = normalizeReferenceId(body);
    const txnAmt = normalizeAmount(body);

    const token = generateIpsToken(MERCHANTID, APPID, referenceId, txnAmt);
    const data = await validateIpsTransaction(referenceId, txnAmt, token);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        status: "ERROR",
        statusDesc: error instanceof Error ? error.message : "Internal Error",
      },
      { status: 500 },
    );
  }
}
