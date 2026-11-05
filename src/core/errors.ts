/**
 * One error vocabulary for the whole app. Codes are stable and safe to show to clients;
 * `detail` is for humans and must never contain secrets or personal data.
 */
export const ErrorCode = {
  Validation: "VALIDATION",
  NotFound: "NOT_FOUND",
  Conflict: "CONFLICT",
  Unauthenticated: "UNAUTHENTICATED",
  Forbidden: "FORBIDDEN",
  DeviceRevoked: "DEVICE_REVOKED",
  RateLimited: "RATE_LIMITED",
  PayloadTooLarge: "PAYLOAD_TOO_LARGE",
  UpgradeRequired: "UPGRADE_REQUIRED",
  Internal: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type FieldIssue = { readonly field: string; readonly message: string };

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly issues: readonly FieldIssue[];

  constructor(code: ErrorCode, detail: string, issues: readonly FieldIssue[] = []) {
    super(detail);
    this.name = "AppError";
    this.code = code;
    this.issues = issues;
  }
}

export const httpStatusFor: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DEVICE_REVOKED: 410,
  PAYLOAD_TOO_LARGE: 413,
  UPGRADE_REQUIRED: 426,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};
