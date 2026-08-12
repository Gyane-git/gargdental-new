import { NextResponse } from "next/server";
import { generateIpsLoginToken } from "@/lib/connectIpsToken";

export const runtime = "nodejs";

// Ports gargnew's app/connectips/get_token/route.ts, rewritten against this project's own
// lib/connectIpsToken.ts (native crypto RSA-SHA256 signing over the real CREDITOR.pem, already
// verified against the mobile payment flow) instead of gargnew's lib/connectips-server.ts, which
// depends on the `pem` package we deliberately excluded from this project (see package.json).
// Called client-side by the storefront checkout pages (cart/checkout/pay-ops,
// cart/checkout-buy-now/pay-ops) to sign the auto-submit form POSTed to the real ConnectIPS
// gateway - distinct from /api/v1/payment/ips/validate, which handles the callback afterward.
// Signs over the whole submitted payload (MERCHANTID..TOKEN=TOKEN, in order) like gargnew's
// createConnectipsToken did - ConnectIPS re-derives the signature from every form field it
// receives, not just MERCHANTID/APPID/REFERENCEID/TXNAMT.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = generateIpsLoginToken(body);

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
