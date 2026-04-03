import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all base64)
  return [iv, tag, encrypted].map((b) => b.toString("base64")).join(":");
}

export function decrypt(token: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = token.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}

/** Encrypt a JS value as JSON, return ciphertext string */
export function encryptJSON(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

/** Decrypt ciphertext back to a parsed JS value */
export function decryptJSON<T = unknown>(token: string): T {
  return JSON.parse(decrypt(token)) as T;
}
