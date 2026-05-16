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
  // New
  USER_2FA_REQUIRED_CHANGED: "user.2fa_required.changed",
  USER_2FA_FORCE_RESET: "user.2fa_force_reset",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
