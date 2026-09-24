import { randomBytes, createHash } from "node:crypto";

const TOKEN_BYTES = 32;
const HASH_ALGO = "sha256";

export function newOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash(HASH_ALGO).update(raw).digest("hex");
}
