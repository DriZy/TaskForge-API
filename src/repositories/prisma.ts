import { PrismaClient } from "@prisma/client";

/**
 * Single shared PrismaClient for the process.
 *
 * All repositories reuse this instance instead of constructing their own,
 * which keeps connection-pool usage predictable in long-running Docker
 * containers and in Vercel's serverless runtime (one logical client per
 * function instance instead of one per repository).
 */
export const prisma = new PrismaClient();