/**
 * Jest setup file — guarantees the integration suite runs ONLY against the
 * isolated `taskforge_test` database.
 *
 * Without this, `import` hoisting loads `src/repositories/*` (which construct
 * a bare `new PrismaClient()` reading `env("DATABASE_URL")`) before the module
 * body of a test file runs; Prisma then loads `.env` and `process.env
 * .DATABASE_URL` points at the dev `taskforge` database. The suite would
 * silently wipe and use the dev/production database.
 *
 * This file runs before every test file's module graph is imported, so it
 * forces both env vars onto the isolated test database. A hard guard rejects
 * profiles that look like integration against the dev/prod database.
 */
const DEFAULT_TEST_URL =
  "postgresql://taskforge:taskforge@127.0.0.1:5432/taskforge_test?schema=public";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_URL;

function databaseNameOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "").split("?")[0];
  } catch {
    return "";
  }
}

const dbName = databaseNameOf(TEST_DATABASE_URL);
if (!dbName.endsWith("_test")) {
  throw new Error(
    `Refusing to run the integration suite: TEST_DATABASE_URL must target a *_test ` +
      `database, got "${dbName}" (never point tests at the dev/production database).`,
  );
}

process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DATABASE_URL;

export { TEST_DATABASE_URL };