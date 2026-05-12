import * as crypto from "crypto";
import { config } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(config.PII_ENCRYPTION_KEY, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cipher = crypto.createCipheriv(ALGORITHM, getKey() as any, iv as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8") as any, cipher.final() as any]);
  const tag = cipher.getAuthTag();
  // Format: iv(hex):tag(hex):ciphertext(hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid ciphertext format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey() as any, iv as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decipher.setAuthTag(tag as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return decipher.update(data as any) + decipher.final("utf8");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}
