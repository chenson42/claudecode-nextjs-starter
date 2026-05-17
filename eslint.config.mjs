// Flat ESLint config for the Claude Code Starter.
// Uses Next.js's bundled flat config (covers next, react, react-hooks, typescript,
// jsx-a11y, import) plus project-specific ignores.
import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "drizzle/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
