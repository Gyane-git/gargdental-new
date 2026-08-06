import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { unauthenticatedResponse } from "./apiResponse";
import type { users } from "@prisma/client";

// bcryptjs recognizes $2a$/$2b$ hashes but some versions mishandle PHP's $2y$ prefix
// (functionally identical bcrypt variant) - normalize before comparing, as gargnew's
// utils/authUser.js already established works reliably against these password hashes.
export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  const normalized = hash.startsWith("$2y$") ? `$2b$${hash.slice(4)}` : hash;
  try {
    return await bcrypt.compare(plain, normalized);
  } catch {
    return false;
  }
}

// Laravel's `auth:api` guard is Passport (OAuth personal access tokens) - but Laravel is being
// retired entirely here, and the mobile app only ever treats the token as an opaque bearer string
// (mints it from /auth/login, sends it back in Authorization headers). So this backend can issue
// and verify its own tokens with no need to replicate Passport's token format internally, as long
// as the *response shape* around it (login/register JSON, 401 on missing/invalid token) matches
// gargdental exactly. We use a signed JWT carrying only the user id, and always re-resolve the
// User row fresh from the DB on every request (matching Passport's guard, which re-resolves the
// User model from the token on each request rather than trusting stale claims).
const JWT_SECRET = process.env.NEXTAUTH_SECRET as string;
const TOKEN_TTL = "365d";

interface TokenPayload {
  id: number;
  type?: string;
}

export function signAuthToken(userId: number | bigint): string {
  const payload: TokenPayload = { id: Number(userId) };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// The mobile app sends `Authorization: Bearer <token>` (no cookies at all), while the ported
// storefront (app/account/**, myaccount/**, cart/**) authenticates via an httpOnly "token" cookie
// set by app/api/auth/set-token/route.ts after login - same cookie name/JWT secret admin auth
// already shares (lib/adminAuth.ts), differentiated there by a `type: "admin"` claim customer
// tokens never carry. Checking the cookie first is purely additive for the mobile app, which
// never sends one.
function getBearerToken(req: NextRequest): string | null {
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) return cookieToken;
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return null;
}

// Resolves the authenticated `users` row for a `middleware('auth:api')`-equivalent route, or
// returns the 401 response bootstrap/app.php:37-45 sends for a failed/missing Passport token.
// Usage: const auth = await requireAuth(req); if (auth instanceof Response) return auth;
export async function requireAuth(req: NextRequest): Promise<users | Response> {
  const token = getBearerToken(req);
  if (!token) {
    return unauthenticatedResponse();
  }

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return unauthenticatedResponse();
  }
  // Same cookie name/secret as admin auth (lib/adminAuth.ts) - an admin's `type: "admin"` token
  // must never be mistaken for a customer session just because its `id` happens to collide with
  // a real users.id.
  if (payload.type === "admin") {
    return unauthenticatedResponse();
  }

  const user = await prisma.users.findUnique({ where: { id: BigInt(payload.id) } });
  if (!user) {
    return unauthenticatedResponse();
  }

  return user;
}

// Mirrors `Auth::guard('api')->user()` used by public product-listing endpoints to
// personalize `is_wishlisted` - returns null on any missing/invalid token instead of a 401
// (the endpoint stays public either way).
export async function optionalAuth(req: NextRequest): Promise<users | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    if (payload.type === "admin") return null;
    return await prisma.users.findUnique({ where: { id: BigInt(payload.id) } });
  } catch {
    return null;
  }
}
