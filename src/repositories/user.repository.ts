import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface UserRepositoryResult {
  id: string;
  email: string;
  passwordHash: string;
}

export const userRepository = {
  async create(email: string, passwordHash: string): Promise<UserRepositoryResult> {
    return prisma.user.create({
      data: { email: email.toLowerCase(), passwordHash },
      select: { id: true, email: true, passwordHash: true },
    });
  },

  async findByEmail(email: string): Promise<UserRepositoryResult | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, passwordHash: true },
    });
  },

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
};
