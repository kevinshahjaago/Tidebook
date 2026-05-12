import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  PII_ENCRYPTION_KEY: z.string().length(64), // 32 bytes as hex
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(12).default(12),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().transform((v) => v === "true").default("false"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  EMAIL_FROM: z.string().min(1),
  DKIM_DOMAIN: z.string().optional(),
  DKIM_SELECTOR: z.string().optional(),
  DKIM_PRIVATE_KEY: z.string().optional(),
  UPLOAD_DIR: z.string().default("/var/tidebook/uploads"),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  ACME_API_URL: z.string().url().optional(),
  ACME_API_KEY: z.string().optional(),
  ACME_USE_MOCK: z.string().transform((v) => v === "true").default("true"),
  REDIS_URL: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_PUBLIC_MAX: z.coerce.number().default(10),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(5),
  WEB_BASE_URL: z.string().default("http://localhost:3000"),
  API_BASE_URL: z.string().default("http://localhost:4000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  HCAPTCHA_SECRET_KEY: z.string().optional(),
  SLOW_QUERY_THRESHOLD_MS: z.coerce.number().default(500),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      "Invalid environment configuration:",
      result.error.flatten().fieldErrors
    );
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
