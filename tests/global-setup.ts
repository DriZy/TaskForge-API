import { execSync } from "node:child_process";
import * as path from "node:path";

/**
 * Jest globalSetup — applies the committed Prisma migrations to the isolated
 * `taskforge_test` database before any suite runs. Keeps the test DB schema in
 * sync automatically so a fresh clone only needs `docker compose up`.
 */
const DEFAULT_TEST_URL =
  "postgresql://taskforge:taskforge@127.0.0.1:5432/taskforge_test?schema=public";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_URL;

const dbName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "").split("?")[0];
if (!dbName.endsWith("_test")) {
  throw new Error(
    `Refusing to migrate TEST_DATABASE_URL "${dbName}": must target a *_test database.`,
  );
}

export default function globalSetup(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}