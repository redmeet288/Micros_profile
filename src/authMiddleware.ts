import { Request, Response, NextFunction } from "express";
import type { RoleValue } from "./domain/role";
import { ALL_ROLES, roleSetsEqual } from "./domain/role";
import { isUuid } from "./uuid";
import prisma from "./infrastructure/prisma";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userUuid: string;
        roles: RoleValue[];
      };
    }
  }
}

function headerString(req: Request, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

function parseRoles(raw: string): RoleValue[] {
  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set<string>(ALL_ROLES);
  const out: RoleValue[] = [];
  for (const t of tokens) {
    const key = t.toUpperCase();
    if (!allowed.has(key)) {
      throw new Error(`Unknown role: ${t}`);
    }
    out.push(key as RoleValue);
  }
  return out;
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const headerUserId = headerString(req, "x-user-id");
    const headerRoles = headerString(req, "x-roles");

    if (!headerUserId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing X-User-Id header",
      });
    }

    if (!headerRoles) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing X-Roles header",
      });
    }

    const userUuid = headerUserId.trim();
    if (!isUuid(userUuid)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "X-User-Id must be a valid UUID",
      });
    }

    let roles: RoleValue[];
    try {
      roles = parseRoles(headerRoles);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid roles";
      return res.status(400).json({
        error: "Bad Request",
        message: msg,
      });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userUuid },
      select: { userUuid: true, roles: true },
    });

    if (!profile) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No profile for this X-User-Id",
      });
    }

    // Проверяем, что X-Roles совпадают с ролями из БД (порядок не важен)
    const allowed = new Set<string>(ALL_ROLES);
    const storedRoles: RoleValue[] = [];
    for (const r of profile.roles) {
      const key = String(r).toUpperCase();
      if (!allowed.has(key)) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: `Profile has invalid role in database: ${r}`,
        });
      }
      storedRoles.push(key as RoleValue);
    }

    if (!roleSetsEqual(storedRoles, roles)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "X-Roles does not match roles stored for this profile",
      });
    }

    req.user = {
      userUuid: profile.userUuid,
      roles: storedRoles,
    };
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Authentication failed",
    });
  }
};
