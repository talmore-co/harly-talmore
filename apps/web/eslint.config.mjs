import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Preserve existing full-page transitions during the 16.3 security update.
    // These flows reset auth state or leave form/editor state behind.
    files: [
      "src/features/account/AccountSettingsPanel.tsx",
      "src/features/automations/builder/WorkflowBuilder.tsx",
      "src/features/career-page/builder/CareerPageBuilder.tsx",
      "src/features/documents/DocumentDetailView.tsx",
      "src/features/jobs/JobForm.tsx",
      "src/features/portal/JobApplyForm.tsx",
    ],
    rules: {
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
