import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const geometryVerification = [
  "src/lib/world/bank-garden.test.ts",
  "src/lib/world/walking.test.ts",
  "src/test/ground-sampler-equivalence.test.ts",
];

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "next/font/google": fileURLToPath(new URL("./src/test/next-font-google.ts", import.meta.url)),
    "next/font/local": fileURLToPath(new URL("./src/test/next-font-local.ts", import.meta.url)),
  } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    projects: [
      { extends: true, test: {
        name: "application",
        include: ["src/**/*.test.{ts,tsx}"],
        exclude: [...configDefaults.exclude, ...geometryVerification],
      } },
      // Preserve every real movement and both existing time limits. These
      // CPU-heavy numeric proofs run after the normal parallel suite, one at
      // a time, rather than competing with its React/rendering workers.
      { extends: true, test: {
        name: "geometry-verification",
        include: geometryVerification,
        maxWorkers: 1,
        sequence: { groupOrder: 1 },
      } },
    ],
  },
});
