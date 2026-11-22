import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // Boundary fixtures are inputs to scripts/boundaries.test.ts, not tests.
    exclude: [...configDefaults.exclude, "scripts/fixtures/**"],
  },
});
