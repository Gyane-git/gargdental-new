import { NextRequest, NextResponse } from "next/server";
import { canAccessAdminPath, getAdminLandingPath } from "@/utils/adminAccess";

// Ported from gargnew's middleware.ts verbatim. Edge middleware can't verify a JWT signature
// (no access to Node's crypto/jsonwebtoken at the edge without extra config), so this only
// base64-decodes the payload for role gating - full signature verification happens in
// lib/adminAuth.ts's requireAdminAuth(), called by every actual admin API route (including
// /admin/auth/me, which app/admin/layout.tsx re-checks on every navigation). This is
// intentional defense-in-depth, not a gap: an attacker forging an unsigned-looking payload here
// still can't get past the real API routes without a validly-signed token.
const decodeJwtPayload = (token: string) => {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const redirectToLogin = (req: NextRequest, loginPath: string, clearToken = false) => {
  const loginUrl = new URL(loginPath, req.url);
  const response = NextResponse.redirect(loginUrl);
  if (clearToken) {
    response.cookies.set("token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });
  }
  return response;
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get("token")?.value;

  const customerAuthRoutes = ["/account", "/account/signup"];

  if (token && customerAuthRoutes.includes(pathname)) {
    return NextResponse.redirect(new URL("/myaccount", req.url));
  }

  // /myaccount/** has no auth guard at all in gargnew's own middleware (confirmed against its
  // source) - an unauthenticated visitor gets the full account UI shell with every data fetch
  // silently 401ing instead of being sent to log in. That's a real gap, not intentional Laravel
  // parity (there's no Laravel page here to be compatible with - this is pure Next.js UI), so
  // it's fixed here rather than faithfully reproduced.
  if (pathname.startsWith("/myaccount")) {
    if (!token) {
      return redirectToLogin(req, "/account");
    }
    const payload = decodeJwtPayload(token);
    const isCustomer = payload?.id && String(payload?.type || "").toLowerCase() !== "admin";
    if (!isCustomer) {
      return redirectToLogin(req, "/account", true);
    }
    return NextResponse.next();
  }

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (!token) {
    return redirectToLogin(req, "/admin/login");
  }

  const payload = decodeJwtPayload(token);
  const role = payload?.role || payload?.accountType || "";
  const accountType = String(payload?.type || "").toLowerCase();

  if (!payload?.id || accountType !== "admin") {
    return redirectToLogin(req, "/admin/login", true);
  }

  if (canAccessAdminPath(pathname, role)) {
    return NextResponse.next();
  }

  const landingPath = getAdminLandingPath(role);

  if (landingPath !== pathname && canAccessAdminPath(landingPath, role)) {
    return NextResponse.redirect(new URL(landingPath, req.url));
  }

  return redirectToLogin(req, "/admin/login", true);
}

export const config = {
  matcher: ["/admin/:path*", "/account", "/account/:path*", "/myaccount", "/myaccount/:path*"],
};
