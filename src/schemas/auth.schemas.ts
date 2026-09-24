import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .email("must be a well-formed email address")
    .max(254, "email must be at most 254 characters"),
  password: z
    .string()
    .min(12, "password must be at least 12 characters")
    .max(128, "password must be at most 128 characters"),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "email is required"),
  password: z.string().min(1, "password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
