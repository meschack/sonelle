import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "scripts/**/*.test.ts",
      "tools/**/*.test.ts"
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/target/**", "**/src-tauri/target/**"]
  },
  resolve: {
    alias: {
      "@sonelle/domain": resolve(root, "packages/domain/src/index.ts"),
      "@sonelle/text": resolve(root, "packages/text/src/index.ts"),
      "@sonelle/reader": resolve(root, "packages/reader/src/index.ts"),
      "@sonelle/library": resolve(root, "packages/library/src/index.ts"),
      "@sonelle/audio": resolve(root, "packages/audio/src/index.ts"),
      "@sonelle/storage": resolve(root, "packages/storage/src/index.ts"),
      "@sonelle/learning": resolve(root, "packages/learning/src/index.ts")
    }
  }
});
