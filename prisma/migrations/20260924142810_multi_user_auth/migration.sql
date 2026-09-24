-- DropIndex
DROP INDEX "tasks_createdAt_idx";

-- DropIndex
DROP INDEX "tasks_dueDate_idx";

-- DropIndex
DROP INDEX "tasks_status_createdAt_idx";

-- DropIndex
DROP INDEX "tasks_status_dueDate_idx";

-- DropIndex
DROP INDEX "tasks_status_idx";

-- AlterTable
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_pkey",
ADD COLUMN     "isShared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerId" UUID NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "title" SET DATA TYPE VARCHAR(255),
ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_tokenHash_key" ON "tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "tokens_userId_idx" ON "tokens"("userId");

-- CreateIndex
CREATE INDEX "tasks_ownerId_isShared_idx" ON "tasks"("ownerId", "isShared");

-- CreateIndex
CREATE INDEX "tasks_ownerId_status_idx" ON "tasks"("ownerId", "status");

-- CreateIndex
CREATE INDEX "tasks_ownerId_createdAt_idx" ON "tasks"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "tasks_ownerId_dueDate_idx" ON "tasks"("ownerId", "dueDate");

-- CreateIndex
CREATE INDEX "tasks_isShared_status_idx" ON "tasks"("isShared", "status");

-- CreateIndex
CREATE INDEX "tasks_isShared_createdAt_idx" ON "tasks"("isShared", "createdAt");

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

