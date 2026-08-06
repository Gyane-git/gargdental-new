import { NextResponse } from "next/server";
import { generateIpsToken } from "@/lib/connectIpsToken";

export const runtime = "nodejs";

// Ports gargnew's app/connectips/get_token/route.ts, rewritten against this project's own
// lib/connectIpsToken.ts (native crypto RSA-SHA256 signing over the real CREDITOR.pem, already
// verified against the mobile payment flow) instead of gargnew's lib/connectips-server.ts, which
// depends on the `pem` package we deliberately excluded from this project (see package.json).
// Called client-side by the storefront checkout pages (cart/checkout/pay-ops,
// cart/checkout-buy-now/pay-ops) to sign the auto-submit form POSTed to the real ConnectIPS
// gateway - distinct from /api/v1/payment/ips/validate, which handles the callback afterward.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const merchantId = String(body.MERCHANTID ?? "");
    const appId = String(body.APPID ?? "");
    const referenceId = String(body.REFERENCEID ?? "");
    const txnAmt = body.TXNAMT as number | string;

    const token = generateIpsToken(merchantId, appId, referenceId, txnAmt);

    return NextResponse.json({ TOKEN: token });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        status: "ERROR",
        statusDesc: error instanceof Error ? error.message : "Failed to generate ConnectIPS token.",
      },
      { status: 500 },
    );
  }
}
