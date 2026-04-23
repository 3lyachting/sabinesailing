import type { NextFunction, Request, Response } from "express";
import { sdk } from "./sdk";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.role !== "admin") {
      return res.status(403).json({ error: "Admin requis" });
    }
    (req as any).authUser = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Authentification requise" });
  }
}

