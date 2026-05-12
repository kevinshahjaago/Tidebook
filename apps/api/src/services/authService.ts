import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { prisma } from "../db";
import { config } from "../config";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode, UserRole } from "@tidebook/shared";
import { auditLog } from "./auditService";
import { JwtPayload } from "../middleware/auth";

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MINUTES = 15;

export function signAccessToken(userId: string, role: UserRole, tokenVersion: number): string {
  return jwt.sign(
    { sub: userId, role, tokenVersion, type: "access" } satisfies JwtPayload,
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.JWT_ACCESS_EXPIRES_IN as any }
  );
}

export function signRefreshToken(userId: string, tokenVersion: number): string {
  return jwt.sign(
    { sub: userId, tokenVersion, type: "refresh" },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRES_IN as any }
  );
}

export async function loginUser(
  email: string,
  password: string,
  ipAddress?: string
): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string; role: UserRole } }> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    await auditLog({ actorType: "SYSTEM", action: "LOGIN_FAILED", entityType: "User", entityId: email, ipAddress });
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, "Invalid email or password", 401);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(ErrorCode.ACCOUNT_LOCKED, "Account is temporarily locked. Try again later.", 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lockUntil = attempts >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60000) : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        ...(lockUntil ? { lockedUntil: lockUntil } : {}),
      },
    });

    await auditLog({ actorType: "SYSTEM", action: "LOGIN_FAILED", entityType: "User", entityId: user.id, ipAddress });
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, "Invalid email or password", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await auditLog({ actorType: "USER", actorId: user.id, action: "LOGIN", entityType: "User", entityId: user.id, ipAddress });

  const accessToken = signAccessToken(user.id, user.role as UserRole, user.tokenVersion);
  const refreshToken = signRefreshToken(user.id, user.tokenVersion);

  return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role as UserRole } };
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: any;
  try {
    payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError(ErrorCode.TOKEN_EXPIRED, "Invalid or expired refresh token", 401);
  }

  if (payload.type !== "refresh") {
    throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid token type", 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
    throw new AppError(ErrorCode.TOKEN_EXPIRED, "Session expired", 401);
  }

  // Rotate tokenVersion on refresh
  const newVersion = user.tokenVersion + 1;
  await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: newVersion } });

  const newAccess = signAccessToken(user.id, user.role as UserRole, newVersion);
  const newRefresh = signRefreshToken(user.id, newVersion);
  return { accessToken: newAccess, refreshToken: newRefresh };
}

export async function logoutUser(userId: string, ipAddress?: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
  await auditLog({ actorType: "USER", actorId: userId, action: "LOGOUT", entityType: "User", entityId: userId, ipAddress });
}
