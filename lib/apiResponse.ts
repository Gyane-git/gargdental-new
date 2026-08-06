import { NextResponse } from "next/server";
import { errorProcessor, type FieldErrors } from "./errorProcessor";

// Standard v1 API envelope, matching the dominant convention across gargdental's
// app/Http/Controllers/API/V1/* controllers. A few endpoints deviate from this on
// purpose (e.g. ReviewController::addReview's 422 raw-bag shape, OrderController::checkValley's
// real Laravel validation-exception shape) - those are built inline at the call site instead of
// through these helpers, with a comment citing the Laravel file:line being replicated.

export function successResponse(
  message: string,
  extraFields: Record<string, unknown> = {},
  status = 200,
) {
  return NextResponse.json({ success: true, message, ...extraFields }, { status });
}

// Mirrors Helpers::error_processor + the {success:false, message:"Validation errors", errors:[...]}
// envelope every v1 controller returns for Validator::make() failures, at HTTP 403 (gargdental's
// dominant status code for validation errors - not Laravel's idiomatic 422).
export function validationErrorResponse(fieldErrors: FieldErrors, status = 403) {
  return NextResponse.json(
    { success: false, message: "Validation errors", errors: errorProcessor(fieldErrors) },
    { status },
  );
}

// Mirrors bootstrap/app.php:37-45's global AuthenticationException render() for auth:api guard
// failures (missing/invalid bearer token) on any api/* route - this is the correct 401 shape for
// unauthenticated requests to protected v1 endpoints, distinct from a login attempt's own
// 401 {"success":false,"message":"Invalid credentials"} (that one is built inline in the login route).
export function unauthenticatedResponse(message = "Valid authentication token required") {
  return NextResponse.json({ error: "Unauthenticated", message }, { status: 401 });
}

// Mirrors the try/catch pattern repeated across v1 controllers: on unexpected exceptions,
// {success:false, message, error: <exception message>} at 500 (exception text is intentionally
// exposed to the client, replicating gargdental's actual behavior).
export function serverErrorResponse(message: string, error: unknown, status = 500) {
  return NextResponse.json(
    {
      success: false,
      message,
      error: error instanceof Error ? error.message : String(error),
    },
    { status },
  );
}
