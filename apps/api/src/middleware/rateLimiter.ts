import rateLimit from "express-rate-limit";
import { config } from "../config";
import { ErrorCode } from "@tidebook/shared";

const rateLimitResponse = (code: string, message: string) => ({
  error: { code, message },
});

export const publicRateLimit = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_PUBLIC_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(rateLimitResponse(ErrorCode.VALIDATION_ERROR, "Too many requests"));
  },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(rateLimitResponse(ErrorCode.UNAUTHORIZED, "Too many login attempts"));
  },
});

export const magicLinkRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req) => (req.body?.email as string) || req.ip || "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(rateLimitResponse(ErrorCode.VALIDATION_ERROR, "Too many requests"));
  },
});

// For reschedule tokens — return 404 not 429 to avoid confirming token existence
export const rescheduleTokenRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req.body?.token as string)?.slice(0, 16) || req.ip || "unknown",
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(404).json(rateLimitResponse(ErrorCode.RESCHEDULE_TOKEN_INVALID, "Not found"));
  },
});
