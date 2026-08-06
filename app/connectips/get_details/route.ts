import { NextResponse } from "next/server";
import { generateIpsToken } from "@/lib/connectIpsToken";
import { ipsDetails } from "@/lib/connectIpsService";

export const runtime = "nodejs";

const MERCHANTID = process.env.CONNECT_IPS_MERCHANT_ID || process.env.NEXT_PUBLIC_CONNECTIPS_MERCHANTID || "";
const APPID = process.env.CONNECT_IPS_APP_ID || process.env.NEXT_PUBLIC_CONNECTIPS_APPID || "";

const normalizeReferenceId = (body: Record<string, unknown>) =>
  String(body.REFERENCEID ?? body.referenceId ?? body.reference_id ?? "");

const normalizeAmount = (body: Record<string, unknown>) =>
  Number(body.TXNAMT ?? body.txnAmt ?? body.txn_amt ?? body.amount ?? 0);

// Ports gargnew's app/connectips/get_details/route.ts, rewritten against lib/connectIpsService.ts
// (see get_token/route.ts's comment for why - same `pem` package avoidance). ipsDetails() already
// builds the real ConnectIPS gettxndetail URL from CONNECT_IPS_BASE_URL, so the separate
// NEXT_PUBLIC_CONNECTIPS_GETDETAILS_URL env var gargnew required is not needed here.
export async function POST(request: Request) {
  try {
    if (!MERCHANTID || !APPID) {
      return NextResponse.json(
        { success: false, status: "ERROR", statusDesc: "ConnectIPS transaction details configuration is missing." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const referenceId = normalizeReferenceId(body);
    const txnAmt = normalizeAmount(body);

    const token = generateIpsToken(MERCHANTID, APPID, referenceId, txnAmt);
    const data = await ipsDetails(referenceId, txnAmt, token);

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
