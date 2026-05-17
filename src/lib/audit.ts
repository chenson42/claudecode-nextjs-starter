// server-only
// This module is a server-side catalog of audit action strings. Do not import
// it from client components — the values are plain string literals that bundle
// safely, but the pattern sets a bad precedent.

export const AUDIT_ACTIONS = {
  // Existing — string values are frozen; they match live audit_events rows.
  FEATURE_FLAG_TOGGLED: "feature_flag.toggled",
  TOTP_ENROLLED: "totp.enrolled",
  TOTP_RECOVERY_CODES_REGENERATED: "totp.recovery_codes.regenerated",
  TOTP_RESET: "totp.reset",
  USER_ROLE_ASSIGNED: "user.role.assigned",
  USER_ROLE_REMOVED: "user.role.removed",
  USER_2FA_REQUIRED_CHANGED: "user.2fa_required.changed",
  USER_2FA_FORCE_RESET: "user.2fa_force_reset",
  // Account self-serve actions
  USER_PROFILE_UPDATED: "user.profile_updated",
  USER_EMAIL_CHANGE_REQUESTED: "user.email_change_requested",
  USER_EMAIL_CHANGED: "user.email_changed",
  USER_EMAIL_CHANGE_CANCELLED: "user.email_change_cancelled",
  USER_PASSWORD_CHANGED: "user.password_changed",
  USER_DELETION_REQUESTED: "user.deletion_requested",
  // Password-reset flow (unauthenticated; no current-password proof required)
  USER_PASSWORD_RESET_REQUESTED: "user.password_reset_requested",
  USER_PASSWORD_RESET_COMPLETED: "user.password_reset_completed",
  // Rate limiting — infrastructure event written from src/lib/rate-limit.ts.
  // The check:audit script scans only src/app/**/actions.ts; it will not see
  // this write. That is correct — do not add audit-exempt annotations to actions.ts.
  RATE_LIMIT_BLOCKED: "rate_limit.blocked",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
