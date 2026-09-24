import type { RequestHandler } from "express";
import { authService } from "../services/auth.service";
import { registerSchema, loginSchema } from "../schemas/auth.schemas";

export const registerController: RequestHandler = async (req, res, next) => {
  try {
    const parsed = registerSchema.parse(req.body);
    const result = await authService.register(parsed);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const loginController: RequestHandler = async (req, res, next) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const result = await authService.login(parsed);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
