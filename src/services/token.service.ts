import { randomBytes, createHash } from "node:crypto";

const TOKEN_BYTES = 32;
const HASH_ALGO = "sha256";

export function newOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash(HASH_ALGO).update(raw).digest("hex");
}

export const TOKEN_OPAQUE_CONTRACT = {
  minLen: 40,
  maxLen: 64,
  // a base64url encoding of 32 bytes is always 43 chars (no padding) — in range
  expectedLen: 43,
  hashLen: 64,
} as const;
