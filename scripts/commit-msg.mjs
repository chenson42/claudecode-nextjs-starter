#!/usr/bin/env node
/**
 * Commit-message validator. CLAUDE.md § "Commit Message Standards" documents
 * the grammar this script enforces.
 *
 * Contract: git passes the path to the commit-message file as process.argv[2].
 * The script exits 0 on a valid message and 1 with a specific error on failure.
 *
 * Exported for unit-testing:
 *   validateCommitMessage(message: string): { ok: true } | { ok: false; error: string }
 */
import { readFileSync } from "node:fs";

// ── Grammar constants ────────────────────────────────────────────────────────

const SUBJECT_RE =
  /^(feat|fix|chore|docs|test|refactor|style|perf|build|ci)(\([^)]+\))?: .{1,100}$/;

const EXEMPTION_RE = /^(Merge |Revert |Release )/;

const ALLOWED_CAUGHT_BY = [
  "automated-test",
  "agent-review",
  "human-review",
  "production",
];

const ALLOWED_DISCOVERED_IN = [
  "Phase-1",
  "Phase-2",
  "Phase-3",
  "Phase-4",
  "Phase-5",
  "Phase-6",
  "post-merge",
  "production",
];

// ── Trailer parser ───────────────────────────────────────────────────────────

/**
 * Parse Git-style trailers from the body of a commit message.
 * Trailers are `Key: value` lines that appear after the first blank line.
 * Returns a Map of key → value (last occurrence wins, matching git behaviour).
 *
 * @param {string} message - full commit message text
 * @returns {Map<string, string>}
 */
export function parseTrailers(message) {
  const trailers = new Map();
  const lines = message.split("\n");
  // Find the first blank line to locate the body
  const blankIdx = lines.findIndex((l) => l.trim() === "");
  if (blankIdx === -1) return trailers;

  const bodyLines = lines.slice(blankIdx + 1);
  for (const line of bodyLines) {
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.+)$/.exec(line.trim());
    if (match) {
      trailers.set(match[1], match[2].trim());
    }
  }
  return trailers;
}

// ── Core validator ───────────────────────────────────────────────────────────

/**
 * Validate a commit message against the project grammar.
 *
 * Steps:
 *  1. Strip comment lines (lines starting with #) and trim.
 *  2. Take the first non-empty line as the subject.
 *  3. If subject matches an exemption prefix → pass immediately.
 *  4. Validate subject against SUBJECT_RE.
 *  5. If prefix is "fix", require Caught-By and Discovered-In trailers.
 *  6–9. Validate each trailer value against its allowed set.
 * 10. Exit with pass or fail.
 *
 * @param {string} message - raw commit message content
 * @returns {{ ok: true } | { ok: false; error: string }}
 */
export function validateCommitMessage(message) {
  // Step 1 — strip comment lines, find subject
  const lines = message.split("\n").filter((l) => !l.startsWith("#"));
  const subject = lines.find((l) => l.trim() !== "")?.trimEnd() ?? "";

  // Step 2 — must have a subject
  if (!subject) {
    return { ok: false, error: "Commit message is empty." };
  }

  // Step 3 — exemption check
  if (EXEMPTION_RE.test(subject)) {
    return { ok: true };
  }

  // Step 4 — first-line format check
  if (!SUBJECT_RE.test(subject)) {
    return {
      ok: false,
      error:
        `Error: commit subject must match "<prefix>: <description>" (1-100 chars)\n` +
        `Allowed prefixes: feat, fix, chore, docs, test, refactor, style, perf, build, ci\n` +
        `Optional scope: feat(admin): description\n` +
        `Got: ${subject}`,
    };
  }

  // Step 5 — fix: trailer requirements
  const prefixMatch = /^(fix)(\([^)]+\))?:/.exec(subject);
  if (!prefixMatch) {
    return { ok: true };
  }

  // Rebuild full message with comment lines stripped for trailer parsing
  const strippedMessage = lines.join("\n");
  const trailers = parseTrailers(strippedMessage);

  // Step 6 — Caught-By presence
  if (!trailers.has("Caught-By")) {
    return {
      ok: false,
      error: `Error: fix commits require a "Caught-By: <value>" trailer\nAllowed: ${ALLOWED_CAUGHT_BY.join(", ")}`,
    };
  }

  // Step 7 — Caught-By value
  const caughtBy = trailers.get("Caught-By");
  if (!ALLOWED_CAUGHT_BY.includes(caughtBy)) {
    return {
      ok: false,
      error:
        `Error: Caught-By value "${caughtBy}" is not valid.\n` +
        `Allowed: ${ALLOWED_CAUGHT_BY.join(", ")}`,
    };
  }

  // Step 8 — Discovered-In presence
  if (!trailers.has("Discovered-In")) {
    return {
      ok: false,
      error: `Error: fix commits require a "Discovered-In: <value>" trailer\nAllowed: ${ALLOWED_DISCOVERED_IN.join(", ")}`,
    };
  }

  // Step 9 — Discovered-In value
  const discoveredIn = trailers.get("Discovered-In");
  if (!ALLOWED_DISCOVERED_IN.includes(discoveredIn)) {
    return {
      ok: false,
      error:
        `Error: Discovered-In value "${discoveredIn}" is not valid.\n` +
        `Allowed: ${ALLOWED_DISCOVERED_IN.join(", ")}`,
    };
  }

  // Step 10 — pass
  return { ok: true };
}

// ── Hook entry point ─────────────────────────────────────────────────────────

// Only run as a git hook when invoked directly (not imported by tests).
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("commit-msg.mjs");

if (isMain && process.argv[2]) {
  const msgPath = process.argv[2];
  let message;
  try {
    message = readFileSync(msgPath, "utf8");
  } catch (err) {
    console.error(`commit-msg: could not read file "${msgPath}": ${err.message}`);
    process.exit(1);
  }

  const result = validateCommitMessage(message);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(0);
}
