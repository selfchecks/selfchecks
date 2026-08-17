export const SELFCHECKS_PACKAGE_VERSION = "0.1.27";

export const starterFiles = {
  ".gitignore": `node_modules/
playwright-report/
test-results/
.selfchecks/
`,
  "README.md": `# Selfchecks starter

This project was created with \`create-selfchecks\` and checks that the Selfchecks
website is available.

\`\`\`bash
npx playwright install chromium
npm test

export SELFCHECKS_URL=https://checks.example.com
export SELFCHECKS_API_TOKEN=replace-with-a-secret
npm run selfchecks -- deploy --project starter --root .
\`\`\`
`,
  "checkly.config.ts": `import { defineConfig } from "@selfchecks/selfchecks";
import { Frequency } from "@selfchecks/selfchecks/constructs";

export default defineConfig({
  projectName: "Selfchecks starter",
  logicalId: "selfchecks-starter",
  checks: {
    activated: true,
    frequency: Frequency.EVERY_10M,
  },
});
`,
  "checks/homepage.check.ts": `import { BrowserCheck, Frequency } from "@selfchecks/selfchecks/constructs";

new BrowserCheck("selfchecks-homepage", {
  name: "Selfchecks homepage",
  activated: true,
  frequency: Frequency.EVERY_10M,
  tags: ["starter", "browser"],
  code: {
    entrypoint: "homepage.spec.ts",
  },
});
`,
  "checks/homepage.spec.ts": `import { expect, test } from "@playwright/test";

test("selfchecks.github.io is available", async ({ page }) => {
  const response = await page.goto("https://selfchecks.github.io/");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/Selfchecks/i);
});
`,
  "playwright.config.ts": `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./checks",
  timeout: 60_000,
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
`,
  "tsconfig.json": `{
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true,
    "strict": true,
    "target": "ES2022",
    "types": ["node"]
  },
  "include": ["**/*.ts"]
}
`,
} as const;

export function createPackageJson(projectName: string): string {
  return `${JSON.stringify(
    {
      name: projectName,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        selfchecks: "selfchecks",
        test: "playwright test",
        typecheck: "tsc --noEmit",
      },
      dependencies: {
        "@playwright/test": "1.58.2",
      },
      devDependencies: {
        "@selfchecks/selfchecks": SELFCHECKS_PACKAGE_VERSION,
        "@selfchecks/selfchecks-cli": SELFCHECKS_PACKAGE_VERSION,
        "@types/node": "^20.19.1",
        typescript: "^5.8.3",
      },
    },
    null,
    2,
  )}\n`;
}
