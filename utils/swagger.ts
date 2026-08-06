import { createSwaggerSpec } from "next-swagger-doc";

// next-swagger-doc types createSwaggerSpec's return as a bare object - it's actually always a
// full OpenAPI document, so cast once here rather than re-asserting `.paths` at every call site.
interface OpenApiSpec {
  paths?: Record<string, Record<string, { tags?: string[] }>>;
  [key: string]: unknown;
}

// Generates the OpenAPI spec from @swagger JSDoc blocks across the entire app/api tree (every
// route.ts under app/api, not just app/api/v1 - the handful of non-v1 routes like /api/auth/logout
// and /api/google-auth back the same web frontend and are documented alongside v1 for completeness).
// `servers` is the site root, so every @swagger `path:` in every route file must be written as the
// FULL path starting with /api/... (e.g. /api/v1/products/search), not relative to /api/v1.
export const getApiDocs = (): OpenApiSpec =>
  createSwaggerSpec({
    apiFolder: "app/api",
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Garg Dental API",
        version: "1.0.0",
        description:
          "v1 REST API backing both the Garg Dental web storefront/admin panel and the mobile app. " +
          "Customer and admin endpoints share the same JWT bearer scheme but are issued from " +
          "different login endpoints and are not interchangeable (an admin token is rejected by " +
          "customer-only endpoints and vice versa).",
      },
      servers: [{ url: "/" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description:
              "Customer token from /api/v1/auth/login or /api/v1/register, or an admin token from " +
              "/api/v1/admin/auth/login. The mobile app sends this header directly; the web " +
              "storefront instead relies on an httpOnly `token` cookie set by /api/auth/set-token " +
              "after login, which routes accept as an equivalent alternative to the header.",
          },
        },
        // Shared response envelopes (lib/apiResponse.ts) - reference these instead of redefining
        // the shape inline in every route's @swagger block.
        schemas: {
          ValidationErrorResponse: {
            type: "object",
            properties: {
              success: { type: "boolean", example: false },
              message: { type: "string", example: "Validation errors" },
              errors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    code: { type: "string", example: "required" },
                    message: { type: "string", example: "The name field is required." },
                  },
                },
              },
            },
          },
          UnauthenticatedResponse: {
            type: "object",
            properties: {
              error: { type: "string", example: "Unauthenticated" },
              message: { type: "string", example: "Valid authentication token required" },
            },
          },
          ServerErrorResponse: {
            type: "object",
            properties: {
              success: { type: "boolean", example: false },
              message: { type: "string", example: "Failed to get products" },
              error: { type: "string", example: "Exception message" },
            },
          },
        },
      },
    },
  }) as OpenApiSpec;

// Distinct @swagger tag names used across app/api, sorted for a stable dropdown order.
export const getApiTags = () => {
  const { paths } = getApiDocs();
  const tags = new Set<string>();

  for (const pathItem of Object.values(paths ?? {})) {
    for (const operation of Object.values(pathItem as Record<string, { tags?: string[] }>)) {
      for (const tag of operation?.tags ?? []) {
        tags.add(tag);
      }
    }
  }

  return [...tags].sort();
};

// Full spec with `paths` narrowed to only the operations carrying `tag`, so the docs UI can offer
// a per-tag "definition" instead of always dumping the entire API.
export const getApiDocsByTag = (tag: string) => {
  const spec = getApiDocs();
  const filteredPaths: Record<string, unknown> = {};

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    const filteredPathItem = Object.fromEntries(
      Object.entries(pathItem as Record<string, { tags?: string[] }>).filter(([, operation]) =>
        operation?.tags?.includes(tag),
      ),
    );
    if (Object.keys(filteredPathItem).length > 0) {
      filteredPaths[path] = filteredPathItem;
    }
  }

  return { ...spec, paths: filteredPaths };
};
