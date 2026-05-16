import { describe, it, expect } from "vitest";
import { AUDIT_ACTIONS } from "./audit";

// Regression guard: AUDIT_ACTIONS catalog must contain exactly the eight
// expected entries with their frozen string values. If any entry is renamed,
// added, or removed, this test fails before a stale audit_events row is
// written to the DB with a bad action string.

const EXPECTED_ENTRIES: Record<keyof typeof AUDIT_ACTIONS, string> = {
  FEATURE_FLAG_TOGGLED: "feature_flag.toggled",
  TOTP_ENROLLED: "totp.enrolled",
  TOTP_RECOVERY_CODES_REGENERATED: "totp.recovery_codes.regenerated",
  TOTP_RESET: "totp.reset",
  USER_ROLE_ASSIGNED: "user.role.assigned",
  USER_ROLE_REMOVED: "user.role.removed",
  USER_2FA_REQUIRED_CHANGED: "user.2fa_required.changed",
  USER_2FA_FORCE_RESET: "user.2fa_force_reset",
};

describe("AUDIT_ACTIONS catalog — regression for audit-string drift", () => {
  it("has exactly eight entries", () => {
    // Arrange
    const keys = Object.keys(AUDIT_ACTIONS);

    // Act + Assert
    expect(keys).toHaveLength(8);
  });

  it("exports every expected key", () => {
    for (const key of Object.keys(EXPECTED_ENTRIES) as Array<keyof typeof AUDIT_ACTIONS>) {
      expect(AUDIT_ACTIONS).toHaveProperty(key);
    }
  });

  it("each key has the exact frozen string value", () => {
    for (const [key, value] of Object.entries(EXPECTED_ENTRIES) as Array<
      [keyof typeof AUDIT_ACTIONS, string]
    >) {
      // Assert
      expect(AUDIT_ACTIONS[key]).toBe(value);
    }
  });

  it("has no extra keys beyond the eight expected entries", () => {
    // Arrange
    const expectedKeys = new Set(Object.keys(EXPECTED_ENTRIES));

    // Act
    const actualKeys = Object.keys(AUDIT_ACTIONS);

    // Assert — every actual key must appear in the expected set
    for (const key of actualKeys) {
      expect(expectedKeys.has(key)).toBe(true);
    }
  });
});
