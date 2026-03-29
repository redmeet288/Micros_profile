import type { Request, Response } from "express";
import { ProfileService } from "../application/profile.service";
import { canViewOthersProfile } from "../domain/profile-visibility";
import {
  Role,
  ALL_ROLES,
  parseStoredRoles,
  type RoleValue,
} from "../domain/role";
import { isUuid } from "../uuid";
import { log } from "node:console";

export class ProfileController {
  public service = new ProfileService();

  private headerString(req: Request, name: string): string | undefined {
    const v = req.headers[name.toLowerCase()];
    if (Array.isArray(v)) return v[0];
    return typeof v === "string" ? v : undefined;
  }

  async getMe(req: Request, res: Response) {
    try {
      const profile = await this.service.getProfileByUserUuid(
        req.user!.userUuid,
      );
      res.json(profile || { message: "Profile not found" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  /**
   * Любой профиль по userUuid с учётом ролей:
   * ADMIN — видит всё; CUSTOMER ↔ EXECUTOR; чужой ADMIN недоступен.
   */
  async getProfileByUserUuid(req: Request, res: Response) {
    try {
      const viewerUuid = req.user?.userUuid;
      if (!viewerUuid) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
      }

      const raw = req.params.userUuid;
      const targetUserUuid = Array.isArray(raw) ? raw[0] : raw;
      if (!targetUserUuid || !isUuid(targetUserUuid)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "userUuid must be a valid UUID",
        });
      }

      const profile = await this.service.getProfileByUserUuid(targetUserUuid);
      if (!profile) {
        return res.status(404).json({
          error: "Not Found",
          message: "Profile not found",
        });
      }

      if (targetUserUuid === viewerUuid) {
        return res.json(profile);
      }

      const targetRoles = parseStoredRoles(profile.roles);
      if (!canViewOthersProfile(req.user!.roles, targetRoles)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to view this profile",
        });
      }

      res.json(profile);
    } catch (err: unknown) {
      console.error("Error in GET /user/:userUuid:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({
        error: "Internal Server Error",
        message,
      });
    }
  }

  async getUserUuidByUsername(req: Request, res: Response) {
    try {
      const username = Array.isArray(req.params.username)
        ? req.params.username[0]
        : req.params.username;
      if (!username) {
        return res.status(400).json({
          error: "Bad Request",
          message: "username is required",
        });
      }

      const userUuid = await this.service.getUserUuidByUsername(username);
      if (!userUuid) {
        return res.status(404).json({
          error: "Not found",
          message: "UserUuid not found",
        });
      }

      res.json({
        success: true,
        userUuid,
        username,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({
        error: "Server Error",
        message,
      });
    }
  }

  /**
   * Создание профиля:
   * POST /create_profile (и совместимо с /create_profile/:userUuid)
   * header: x-user-id
   * body: { "username": "..." }
   */
  async createProfileByUserUuid(req: Request, res: Response) {
    try {
      const rawHeaderUserUuid = this.headerString(req, "x-user-id");
      const rawParamUserUuid = req.params.userUuid;

      const paramUserUuid = Array.isArray(rawParamUserUuid)
        ? rawParamUserUuid[0]
        : rawParamUserUuid;
      const userUuid =
        rawHeaderUserUuid?.trim() ??
        (paramUserUuid ? String(paramUserUuid).trim() : "");

      if (!userUuid || !isUuid(userUuid)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "x-user-id must be a valid UUID",
        });
      }

      const body = req.body as Record<string, unknown> | undefined;
      const bodyUsername =
        body && typeof body.username === "string" ? body.username.trim() : "";

      // Backward compatible: username can still come from the old header `username`.
      const rawUsernameHeader = this.headerString(req, "username");
      const username =
        bodyUsername || (rawUsernameHeader ? rawUsernameHeader.trim() : "");

      if (!username) {
        return res.status(400).json({
          error: "Bad Request",
          message: "username must be provided in body as { username }",
        });
      }

      const email =
        body && typeof body.email === "string" ? body.email : undefined;
      const fullName =
        body && typeof body.fullName === "string" ? body.fullName : undefined;

      const createData: {
        username: string;
        email?: string;
        fullName?: string;
      } = { username };
      if (email !== undefined) createData.email = email;
      if (fullName !== undefined) createData.fullName = fullName;

      const profile = await this.service.createProfileByUserUuid(
        userUuid,
        createData,
      );

      res.json(profile);
    } catch (err: unknown) {
      const e = err as { code?: string; meta?: { target?: string[] } };

      if (e.code === "P2002") {
        const field = e.meta?.target?.[0] || "field";
        return res.status(409).json({
          error: "Conflict",
          message: `${field} already exists`,
        });
      }

      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  async connectTelegram(req: Request, res: Response) {
    try {
      const raw = req.body?.telegramId ?? req.body?.telegramID;
      if (raw === undefined || raw === null) {
        return res.status(400).json({
          error: "Bad Request",
          message: "telegramId is required",
        });
      }
      const telegramId = parseInt(String(raw), 10);
      if (isNaN(telegramId) || telegramId <= 0) {
        return res.status(400).json({
          error: "Bad Request",
          message: "telegramId must be a positive number",
        });
      }

      const profile = await this.service.connectTelegram(
        req.user!.userUuid,
        telegramId,
      );
      res.json(profile);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const userUuid = req.user?.userUuid;
      if (!userUuid) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
      }

      const updateData = req.body as Record<string, unknown>;

      const allowedFields = [
        "username",
        "email",
        "fullName",
        "telegramUsername",
        "phone",
        "bio",
        "avatarUrl",
        "location",
        "specialization",
        "stack",
        "experienceLevel",
        "status",
        "telegramId",
      ] as const;

      const filteredData: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (updateData[field] !== undefined && updateData[field] !== null) {
          filteredData[field] = updateData[field];
        }
      }

      const validationErrors: string[] = [];

      if (
        filteredData.email &&
        typeof filteredData.email === "string" &&
        !this.isValidEmail(filteredData.email)
      ) {
        validationErrors.push("Invalid email format");
      }

      if (
        filteredData.experienceLevel &&
        typeof filteredData.experienceLevel === "string" &&
        !["JUNIOR", "MIDDLE", "SENIOR", "LEAD"].includes(
          filteredData.experienceLevel,
        )
      ) {
        validationErrors.push(
          "experienceLevel must be JUNIOR, MIDDLE, SENIOR or LEAD",
        );
      }

      if (
        filteredData.status &&
        typeof filteredData.status === "string" &&
        !["ACTIVE", "INACTIVE", "BANNED", "BUSY"].includes(filteredData.status)
      ) {
        validationErrors.push(
          "status must be ACTIVE, INACTIVE, BANNED or BUSY",
        );
      }

      if (filteredData.telegramId !== undefined) {
        const telegramId = parseInt(String(filteredData.telegramId), 10);
        if (isNaN(telegramId) || telegramId <= 0) {
          validationErrors.push("telegramId must be a positive number");
        } else {
          filteredData.telegramId = telegramId;
        }
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: "Validation Error",
          messages: validationErrors,
        });
      }

      const updatedProfile = await this.service.updateProfile(
        userUuid,
        filteredData,
      );

      res.json({
        success: true,
        message: "Profile updated successfully",
        profile: updatedProfile,
      });
    } catch (error: unknown) {
      console.error("Error updating profile:", error);

      const err = error as {
        code?: string;
        meta?: { target?: string[] };
      };

      if (err.code === "P2002") {
        const field = err.meta?.target?.[0] || "field";
        return res.status(409).json({
          error: "Conflict",
          message: `${field} already exists`,
        });
      }

      if (err.code === "P2025") {
        return res.status(404).json({
          error: "Not Found",
          message: "Profile not found",
        });
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update profile",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      });
    }
  }

  /** Смена ролей по userUuid — только ADMIN. */
  async setRolesByUserUuid(req: Request, res: Response) {
    try {
      if (!req.user?.roles.includes(Role.ADMIN)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only ADMIN can change roles",
        });
      }

      const raw = req.params.userUuid;
      const userUuid = Array.isArray(raw) ? raw[0] : raw;
      if (!userUuid || !isUuid(userUuid)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "userUuid must be a valid UUID",
        });
      }

      const body = req.body as { roles?: unknown };
      if (!Array.isArray(body.roles) || body.roles.length === 0) {
        return res.status(400).json({
          error: "Bad Request",
          message: "body.roles must be a non-empty array of role strings",
        });
      }

      const allowed = new Set<string>(ALL_ROLES);
      const roles: RoleValue[] = [];
      for (const item of body.roles) {
        const key =
          typeof item === "string"
            ? item.trim().toUpperCase()
            : String(item).toUpperCase();
        if (!allowed.has(key)) {
          return res.status(400).json({
            error: "Bad Request",
            message: `Unknown role: ${String(item)}`,
          });
        }
        roles.push(key as RoleValue);
      }

      const unique = [...new Set(roles)];
      const profile = await this.service.updateRolesByUserUuid(
        userUuid,
        unique,
      );

      res.json({
        success: true,
        message: "Roles updated",
        profile,
      });
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === "P2025") {
        return res.status(404).json({
          error: "Not Found",
          message: "Profile not found",
        });
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }

  private isValidEmail(email: string): boolean {
    const trimmed = (email || "").trim();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(trimmed);
  }
}
