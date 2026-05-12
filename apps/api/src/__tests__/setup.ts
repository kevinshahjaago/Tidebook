// Minimal env vars required for config.ts to pass validation in unit tests.
// These are test-only values — no real secrets.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.PII_ENCRYPTION_KEY = "a".repeat(64);
process.env.JWT_ACCESS_SECRET = "test-jwt-access-secret-must-be-at-least-32-characters";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-must-be-at-least-32-characters";
process.env.SMTP_HOST = "localhost";
process.env.EMAIL_FROM = "test@test.com";
