// Port of Laravel's Helpers::error_processor($validator) (app/CentralLogics/Helpers.php:37-44
// in gargdental). Turns a { field: message | message[] } bag into Laravel's exact
// [{code, message}] array shape, taking only the first message per field.
export type FieldErrors = Record<string, string | string[]>;

export function errorProcessor(fieldErrors: FieldErrors): { code: string; message: string }[] {
  return Object.entries(fieldErrors).map(([code, message]) => ({
    code,
    message: Array.isArray(message) ? message[0] : message,
  }));
}
