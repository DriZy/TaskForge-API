import type { RequestHandler } from "express";
import { tokenRepository } from "../repositories/token.repository";
import { userRepository } from "../repositories/user.repository";
import { hashToken } from "../services/token.service";

export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Missing or malformed Authorization header" },
    });
    return;
  }

  const raw = header.slice("Bearer ".length).trim();
  const token = await tokenRepository.findByTokenHash(hashToken(raw));
  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Unknown or expired token" },
    });
    return;
  }

  const user = await userRepository.findById(token.userId);
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Token owner no longer exists" },
    });
    return;
  }

  req.user = user;
  next();
};
