import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@tidebook/shared";
import { config } from "../config";
import { prisma } from "../db";
import { AppError } from "./errorHandler";
import { ErrorCode } from "@tidebook/shared";

export interface JwtPayload {
  sub: string;
  role: UserRole;
  tokenVersion: number;
  type: "access";
}

export interface ConnectionsJwtPayload {
  sub: string;
  type: "connections";
  tokenVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole };
      connectionsPartner?: { id: string };
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(ErrorCode.UNAUTHORIZED, "Authentication required", 401));
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;

    if (payload.type !== "access") {
      throw new Error("Wrong token type");
    }

    // Verify tokenVersion matches current DB value
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isActive: true, tokenVersion: true },
    });

    if (!user || !user.isActive) {
      return next(new AppError(ErrorCode.UNAUTHORIZED, "Authentication required", 401));
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      return next(new AppError(ErrorCode.TOKEN_EXPIRED, "Session expired", 401));
    }

    req.user = { id: user.id, role: user.role as UserRole };
    next();
  } catch {
    next(new AppError(ErrorCode.UNAUTHORIZED, "Authentication required", 401));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(ErrorCode.UNAUTHORIZED, "Authentication required", 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError(ErrorCode.FORBIDDEN, "Insufficient permissions", 403));
    }
    next();
  };
}

export async function requireConnectionsAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(ErrorCode.UNAUTHORIZED, "Authentication required", 401));
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as ConnectionsJwtPayload;

    if (payload.type !== "connections") {
      throw new Error("Wrong token type");
    }

    const partner = await prisma.connectionsPartner.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, tokenVersion: true },
    });

    if (!partner || !partner.isActive) {
      return next(new AppError(ErrorCode.UNAUTHORIZED, "Authentication required", 401));
    }

    if (partner.tokenVersion !== payload.tokenVersion) {
      return next(new AppError(ErrorCode.TOKEN_EXPIRED, "Session expired", 401));
    }

    req.connectionsPartner = { id: partner.id };
    next();
  } catch {
    next(new AppError(ErrorCode.UNAUTHORIZED, "Authentication required", 401));
  }
}
