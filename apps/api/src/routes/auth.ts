import { Router, Request, Response, NextFunction } from "express";
import { loginUser, refreshAccessToken, logoutUser } from "../services/authService";
import { validate } from "../middleware/validate";
import { authRateLimit } from "../middleware/rateLimiter";
import { requireAuth } from "../middleware/auth";
import { loginSchema } from "@tidebook/shared";
import { z } from "zod";

export const authRouter = Router();

authRouter.post("/login", authRateLimit, validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await loginUser(req.body.email, req.body.password, req.ip);

    // Set refresh token as HttpOnly cookie
    res.cookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/v1/auth/refresh",
    });

    res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "No refresh token" } });
      return;
    }
    const result = await refreshAccessToken(token);

    res.cookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/v1/auth/refresh",
    });

    res.json({ accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await logoutUser(req.user!.id, req.ip);
    res.clearCookie("refresh_token", { path: "/api/v1/auth/refresh" });
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
});
