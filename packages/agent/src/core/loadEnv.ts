import { config as loadDotenv } from "dotenv";
import { existsSync } from "fs";
import { resolve, dirname } from "path";

/**
 * Loads environment variables from the monorepo root, walking up from the
 * current working directory to find it. This matters because workspace scripts
 * (seed:chroma, dev) run inside each package, so a plain dotenv.config() would
 * look in the package folder instead of the repo root where .env.local lives.
 *
 * .env.local is loaded first so it takes precedence (dotenv never overrides an
 * already-set variable), then .env as a fallback.
 */
export function loadRootEnv(): void {
  let dir = process.cwd();

  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  loadDotenv({ path: resolve(dir, ".env.local") });
  loadDotenv({ path: resolve(dir, ".env") });
}
