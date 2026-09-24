import bcrypt from "bcryptjs";
import { AppError } from "../middleware/app-error";
import { userRepository } from "../repositories/user.repository";
import { tokenRepository } from "../repositories/token.repository";
import { newOpaqueToken, hashToken } from "./token.service";

const BCRYPT_ROUNDS = 12;

export interface AuthResult {
  token: string;
  user: { id: string; email: string };
}

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

async function issueToken(userId: string): Promise<string> {
  const raw = newOpaqueToken();
  await tokenRepository.create(userId, hashToken(raw));
  return raw;
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new AppError(409, "CONFLICT", "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await userRepository.create(email, passwordHash);
    const token = await issueToken(user.id);

    return { token, user: { id: user.id, email: user.email } };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid credentials");
    }

    const matches = await bcrypt.compare(input.password, user.passwordHash);
    if (!matches) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid credentials");
    }

    const token = await issueToken(user.id);
    return { token, user: { id: user.id, email: user.email } };
  },
};
