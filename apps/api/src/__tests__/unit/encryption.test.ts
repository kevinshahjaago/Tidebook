// Must set env before importing the module
process.env.PII_ENCRYPTION_KEY = "a".repeat(64);
process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
process.env.JWT_ACCESS_SECRET = "test-secret-must-be-long-enough-for-zod-32chars";
process.env.JWT_REFRESH_SECRET = "test-refresh-must-be-long-enough-for-zod-32chars";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_USER = "test@test.com";
process.env.SMTP_PASS = "pass";
process.env.EMAIL_FROM = "test@test.com";

import { encrypt, decrypt, hashToken, generateSecureToken } from "../../utils/encryption";

describe("encryption utilities", () => {
  it("encrypts and decrypts a string correctly", () => {
    const original = "teacher@school.edu";
    const ciphertext = encrypt(original);
    expect(ciphertext).not.toBe(original);
    expect(decrypt(ciphertext)).toBe(original);
  });

  it("produces different ciphertext for same input (random IV)", () => {
    const original = "teacher@school.edu";
    const c1 = encrypt(original);
    const c2 = encrypt(original);
    expect(c1).not.toBe(c2);
    expect(decrypt(c1)).toBe(original);
    expect(decrypt(c2)).toBe(original);
  });

  it("throws on tampered ciphertext", () => {
    const ciphertext = encrypt("test data");
    const parts = ciphertext.split(":");
    parts[2] = "ff" + parts[2].slice(2); // corrupt ciphertext
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("hashToken produces consistent output", () => {
    const token = "my-secret-token";
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });

  it("generateSecureToken produces hex string of correct length", () => {
    const token = generateSecureToken(32);
    expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(/^[0-9a-f]+$/i.test(token)).toBe(true);
  });
});
