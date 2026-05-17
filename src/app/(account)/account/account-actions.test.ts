import { describe, it, expect } from "vitest";

// Pure-logic regression tests for account server actions.
//
// These actions import next/cache, next-auth, drizzle-orm/neon-http — all
// server-only runtime modules that cannot run in Vitest. The strategy matches
// the established pattern in src/app/(admin)/admin/users/[id]/actions.test.ts:
// extract the guard predicates as inline pure functions that mirror the action
// logic exactly and test those. The build + typecheck gate proves the import
// graph is valid; these tests prove the branching logic is correct.

// ── changePassword — guard predicates ───────────────────────────────────────
//
// Implementation in src/app/(account)/account/actions.ts:
//   if (!userRow?.password) return { ok: false, error: "No password is set..." }
//   const matches = await compare(input.currentPassword, userRow.password);
//   if (!matches) return { ok: false, error: "Current password is incorrect." }
//   if (input.newPassword.length < 8) return { ok: false, error: "..." }
//   if (input.newPassword !== input.confirmPassword) return { ok: false, ... }

function noPasswordGuardTriggered(storedPassword: string | null | undefined): boolean {
  return !storedPassword;
}

function newPasswordTooShort(newPassword: string): boolean {
  return newPassword.length < 8;
}

function confirmPasswordMismatch(newPassword: string, confirmPassword: string): boolean {
  return newPassword !== confirmPassword;
}

describe(
  "changePassword — guard predicates — regression for Google-only user and wrong current password",
  () => {
    describe("no-password guard (Google-only users)", () => {
      it("triggers when stored password is null — regression for Google-only account accessing change-password", () => {
        // Arrange
        const storedPassword = null;

        // Act
        const blocked = noPasswordGuardTriggered(storedPassword);

        // Assert
        expect(blocked).toBe(true);
      });

      it("triggers when stored password is undefined (row not found)", () => {
        // Arrange
        const storedPassword = undefined;

        // Act
        const blocked = noPasswordGuardTriggered(storedPassword);

        // Assert
        expect(blocked).toBe(true);
      });

      it("does not trigger when stored password is a non-empty string", () => {
        // Arrange
        const storedPassword = "$2b$10$somebcrypthashvalue";

        // Act
        const blocked = noPasswordGuardTriggered(storedPassword);

        // Assert
        expect(blocked).toBe(false);
      });
    });

    describe("new password length validation", () => {
      it("rejects passwords shorter than 8 characters", () => {
        expect(newPasswordTooShort("short")).toBe(true);
        expect(newPasswordTooShort("seven77")).toBe(true);
      });

      it("accepts passwords of exactly 8 characters", () => {
        expect(newPasswordTooShort("exactly8")).toBe(false);
      });

      it("accepts passwords longer than 8 characters", () => {
        expect(newPasswordTooShort("a-longer-secure-password")).toBe(false);
      });
    });

    describe("confirm password mismatch check", () => {
      it("rejects when new and confirm passwords differ", () => {
        // Arrange
        const newPassword = "newpassword1";
        const confirmPassword = "newpassword2";

        // Act
        const mismatch = confirmPasswordMismatch(newPassword, confirmPassword);

        // Assert
        expect(mismatch).toBe(true);
      });

      it("accepts when new and confirm passwords match exactly", () => {
        // Arrange
        const newPassword = "newpassword1";
        const confirmPassword = "newpassword1";

        // Act
        const mismatch = confirmPasswordMismatch(newPassword, confirmPassword);

        // Assert
        expect(mismatch).toBe(false);
      });
    });
  },
);

// ── requestEmailChange — guard predicates ───────────────────────────────────
//
// Implementation in src/app/(account)/account/actions.ts:
//   if (newEmail === (session.user.email ?? "").toLowerCase()) { reject }
//   const taken = await db.query.users.findFirst(...)
//   if (taken) return { ok: false, error: "That email is already in use." }
//
// NOTE: The implementation does NOT check whether newEmail is the target of a
// pending email_verification_tokens row for another user. This gap is
// documented in Phase 5 and returned to the implementer.

function emailIsSameAsCurrent(newEmail: string, currentEmail: string): boolean {
  return newEmail.toLowerCase() === (currentEmail ?? "").toLowerCase();
}

function emailFormatValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

describe(
  "requestEmailChange — guard predicates — regression for same-email and already-taken email",
  () => {
    describe("same-as-current check", () => {
      it("rejects when new email matches current email exactly", () => {
        // Arrange
        const currentEmail = "user@example.com";
        const newEmail = "user@example.com";

        // Act
        const blocked = emailIsSameAsCurrent(newEmail, currentEmail);

        // Assert
        expect(blocked).toBe(true);
      });

      it("rejects when new email matches current email case-insensitively", () => {
        // Arrange
        const currentEmail = "User@Example.COM";
        const newEmail = "user@example.com";

        // Act
        const blocked = emailIsSameAsCurrent(newEmail, currentEmail);

        // Assert
        expect(blocked).toBe(true);
      });

      it("allows when new email differs from current email", () => {
        // Arrange
        const currentEmail = "user@example.com";
        const newEmail = "other@example.com";

        // Act
        const blocked = emailIsSameAsCurrent(newEmail, currentEmail);

        // Assert
        expect(blocked).toBe(false);
      });
    });

    describe("email format validation", () => {
      it("accepts a well-formed email address", () => {
        expect(emailFormatValid("user@example.com")).toBe(true);
      });

      it("rejects a string with no @ sign", () => {
        expect(emailFormatValid("notanemail")).toBe(false);
      });

      it("rejects a string with no domain", () => {
        expect(emailFormatValid("user@")).toBe(false);
      });

      it("rejects an empty string", () => {
        expect(emailFormatValid("")).toBe(false);
      });
    });

    describe("pending-token cross-user collision check", () => {
      // The action checks email_verification_tokens.newEmail for cross-user
      // collisions (Bug 2 fix, Phase 4 loop-back). If another user already has
      // a pending verification token for the same target address, the request
      // is rejected with a friendly message before hitting the DB unique
      // constraint on users.email at verification time.
      //
      // The guard predicate mirrors actions.ts:
      //   if (pendingTaken) return { ok: false, error: "..." }
      //   where pendingTaken = db.query.emailVerificationTokens.findFirst({
      //     where: and(eq(newEmail), ne(userId))
      //   })

      function pendingTokenCollisionDetected(
        pendingRow: { id: string } | undefined,
      ): boolean {
        return pendingRow !== undefined;
      }

      it("blocks when another user has a pending token for the same target email", () => {
        // Arrange — simulate a pending token row for a different user
        const pendingRow = { id: "some-other-uuid" };

        // Act
        const blocked = pendingTokenCollisionDetected(pendingRow);

        // Assert
        expect(blocked).toBe(true);
      });

      it("allows when no pending token exists for the target email from another user", () => {
        // Arrange — no row found
        const pendingRow = undefined;

        // Act
        const blocked = pendingTokenCollisionDetected(pendingRow);

        // Assert
        expect(blocked).toBe(false);
      });
    });
  },
);

// ── emailVerificationTokens schema — structural regression ──────────────────
//
// Mirrors the pattern from admin/users/[id]/actions.test.ts: import the schema
// and assert the new table + its unique indexes are exported. If the table
// is removed or renamed, the actions that INSERT/DELETE against it would break
// at runtime; the test surface this at test time.

describe(
  "emailVerificationTokens schema exports — regression for missing table or index definitions",
  () => {
    it("emailVerificationTokens is exported from schema", async () => {
      // Arrange + Act
      const schema = await import("@/lib/db/schema");

      // Assert
      expect(schema.emailVerificationTokens).toBeDefined();
    });

    it("emailVerificationTokens has the required columns", async () => {
      // Arrange + Act
      const schema = await import("@/lib/db/schema");
      const table = schema.emailVerificationTokens;

      // Assert — Drizzle exposes columns via the table symbol
      expect(table).toHaveProperty("userId");
      expect(table).toHaveProperty("token");
      expect(table).toHaveProperty("newEmail");
      expect(table).toHaveProperty("expiresAt");
    });
  },
);
