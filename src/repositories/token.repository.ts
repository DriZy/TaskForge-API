import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const tokenRepository = {
  async create(
    userId: string,
    tokenHash: string,
  ): Promise<{ id: string; userId: string }> {
    return prisma.token.create({
      data: { userId, tokenHash },
      select: { id: true, userId: true },
    });
  },

  async findByTokenHash(
    tokenHash: string,
  ): Promise<{ userId: string } | null> {
    return prisma.token.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
  },
};
