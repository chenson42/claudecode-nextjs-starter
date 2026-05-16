/**
 * Reserved name of the role that bypasses per-feature checks and is treated
 * as "has every feature in the catalog." A single source of truth — never
 * inline the literal `"admin"` in code or middleware.
 */
export const ADMIN_ROLE = "admin" as const;
export const MEMBER_ROLE = "member" as const;

export const FEATURES = {
  ADMIN_DASHBOARD: "admin.dashboard",
  ADMIN_USERS: "admin.users",
  ADMIN_FLAGS: "admin.flags",
  ADMIN_RELEASE_NOTES: "admin.release_notes",
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

export const FEATURE_CATALOG: Array<{
  key: FeatureKey;
  name: string;
  description: string;
  category: string;
}> = [
  {
    key: FEATURES.ADMIN_DASHBOARD,
    name: "Admin dashboard",
    description: "Access the /admin landing page.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_USERS,
    name: "Manage users",
    description: "View users and assign roles.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_FLAGS,
    name: "Manage feature flags",
    description: "Toggle environment feature flags on or off.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_RELEASE_NOTES,
    name: "Read release notes",
    description: "View release notes from the admin docs page.",
    category: "admin",
  },
];

export function hasFeature(
  userFeatures: string[] | undefined,
  required: FeatureKey,
): boolean {
  return Array.isArray(userFeatures) && userFeatures.includes(required);
}
