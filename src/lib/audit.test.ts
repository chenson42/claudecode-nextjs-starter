import { describe, it, expect } from "vitest";
import { AUDIT_ACTIONS } from "./audit";

// Regression guard: AUDIT_ACTIONS catalog must contain exactly the expected
// entries with their frozen string values. If any entry is renamed, added, or
// removed, this test fails before a stale audit_events row is written to the
// DB with a bad action string.

const EXPECTED_ENTRIES: Record<keyof typeof AUDIT_ACTIONS, string> = {
  FEATURE_FLAG_TOGGLED: "feature_flag.toggled",
  TOTP_ENROLLED: "totp.enrolled",
  TOTP_RECOVERY_CODES_REGENERATED: "totp.recovery_codes.regenerated",
  TOTP_RESET: "totp.reset",
  USER_ROLE_ASSIGNED: "user.role.assigned",
  USER_ROLE_REMOVED: "user.role.removed",
  USER_2FA_REQUIRED_CHANGED: "user.2fa_required.changed",
  USER_2FA_FORCE_RESET: "user.2fa_force_reset",
  // Account self-serve actions (added with /account page feature)
  USER_PROFILE_UPDATED: "user.profile_updated",
  USER_EMAIL_CHANGE_REQUESTED: "user.email_change_requested",
  USER_EMAIL_CHANGED: "user.email_changed",
  USER_EMAIL_CHANGE_CANCELLED: "user.email_change_cancelled",
  USER_PASSWORD_CHANGED: "user.password_changed",
  USER_DELETION_REQUESTED: "user.deletion_requested",
  // Password-reset flow (unauthenticated)
  USER_PASSWORD_RESET_REQUESTED: "user.password_reset_requested",
  USER_PASSWORD_RESET_COMPLETED: "user.password_reset_completed",
  // TOTP verification attempts (src/app/(auth)/totp/actions.ts)
  TOTP_VERIFY_FAILED: "totp.verify_failed",
  TOTP_VERIFY_SUCCEEDED: "totp.verify_succeeded",
  TOTP_RECOVERY_FAILED: "totp.recovery_failed",
  TOTP_RECOVERY_SUCCEEDED: "totp.recovery_succeeded",
  // Admin user management (deactivate / reactivate)
  USER_DEACTIVATED: "user.deactivated",
  USER_REACTIVATED: "user.reactivated",
  // Rate limiting — written from src/lib/rate-limit.ts, not from actions.ts
  RATE_LIMIT_BLOCKED: "rate_limit.blocked",
};

const EXPECTED_COUNT = Object.keys(EXPECTED_ENTRIES).length;

describe("AUDIT_ACTIONS catalog — regression for audit-string drift", () => {
  it(`has exactly ${EXPECTED_COUNT} entries`, () => {
    const keys = Object.keys(AUDIT_ACTIONS);
    expect(keys).toHaveLength(EXPECTED_COUNT);
  });

  it("exports every expected key", () => {
    for (const key of Object.keys(EXPECTED_ENTRIES) as Array<
      keyof typeof AUDIT_ACTIONS
    >) {
      expect(AUDIT_ACTIONS).toHaveProperty(key);
    }
  });

  it("each key has the exact frozen string value", () => {
    for (const [key, value] of Object.entries(EXPECTED_ENTRIES) as Array<
      [keyof typeof AUDIT_ACTIONS, string]
    >) {
      expect(AUDIT_ACTIONS[key]).toBe(value);
    }
  });

  it(`has no extra keys beyond the ${EXPECTED_COUNT} expected entries`, () => {
    const expectedKeys = new Set(Object.keys(EXPECTED_ENTRIES));
    const actualKeys = Object.keys(AUDIT_ACTIONS);
    for (const key of actualKeys) {
      expect(expectedKeys.has(key)).toBe(true);
    }
  });
});
